"""
Real-ESRGAN Upscaler Service.

Extracted from resolution-upscaling/real_esrgan_upscaler.ipynb.
Uses spandrel for model loading with tiled processing and blending.
"""

import gc
import os
import time
import numpy as np
import torch
import cv2
from pathlib import Path
from PIL import Image
from spandrel import ImageModelDescriptor, ModelLoader

from utils.dimension_calculator import calculate_scale_for_crop
from utils.image_utils import save_image_formats

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class EsrganUpscaler:
    def __init__(self, models_dir: str = None):
        self.models_dir = Path(models_dir or os.environ.get("MODEL_CACHE_DIR", "/app/models"))
        self.upscale_models_dir = self.models_dir / "upscale_models"
        self._loaded_model = None
        self._loaded_model_name = None

    def _clear_memory(self):
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        gc.collect()

    def _load_model(self, model_name: str, use_fp16: bool = True):
        """Load upscale model via spandrel, caching for reuse."""
        if self._loaded_model_name == model_name and self._loaded_model is not None:
            return self._loaded_model

        # Unload previous model
        if self._loaded_model is not None:
            del self._loaded_model
            self._clear_memory()

        model_path = self.upscale_models_dir / model_name
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")

        model = ModelLoader().load_from_file(str(model_path))
        assert isinstance(model, ImageModelDescriptor), "Not an image model!"

        model = model.to(DEVICE)
        if use_fp16 and DEVICE.type == "cuda":
            model = model.half()
        model.eval()

        self._loaded_model = model
        self._loaded_model_name = model_name
        return model

    def _upscale_with_tiles(
        self,
        model,
        img_tensor: torch.Tensor,
        tile_size: int,
        tile_overlap: int,
    ) -> torch.Tensor:
        """Upscale image using tiled processing with feathered blending."""
        scale = model.scale
        _, _, h, w = img_tensor.shape

        if h <= tile_size and w <= tile_size:
            with torch.no_grad():
                return model(img_tensor)

        out_h, out_w = h * scale, w * scale
        output = torch.zeros(
            (1, 3, out_h, out_w), device=img_tensor.device, dtype=img_tensor.dtype
        )
        weight = torch.zeros(
            (1, 1, out_h, out_w), device=img_tensor.device, dtype=img_tensor.dtype
        )

        stride = tile_size - tile_overlap
        h_tiles = max(1, (h - tile_overlap) // stride + (1 if (h - tile_overlap) % stride else 0))
        w_tiles = max(1, (w - tile_overlap) // stride + (1 if (w - tile_overlap) % stride else 0))

        for i in range(h_tiles):
            for j in range(w_tiles):
                y1 = min(i * stride, h - tile_size) if h > tile_size else 0
                x1 = min(j * stride, w - tile_size) if w > tile_size else 0
                y2 = min(y1 + tile_size, h)
                x2 = min(x1 + tile_size, w)

                tile = img_tensor[:, :, y1:y2, x1:x2]
                with torch.no_grad():
                    tile_out = model(tile)

                out_y1, out_y2 = y1 * scale, y2 * scale
                out_x1, out_x2 = x1 * scale, x2 * scale

                tile_h, tile_w = tile_out.shape[2:]
                mask = torch.ones(
                    (1, 1, tile_h, tile_w), device=tile_out.device, dtype=tile_out.dtype
                )

                feather = tile_overlap * scale // 2
                if feather > 0:
                    if i > 0:
                        for k in range(feather):
                            mask[:, :, k, :] *= k / feather
                    if i < h_tiles - 1:
                        for k in range(feather):
                            mask[:, :, -(k + 1), :] *= k / feather
                    if j > 0:
                        for k in range(feather):
                            mask[:, :, :, k] *= k / feather
                    if j < w_tiles - 1:
                        for k in range(feather):
                            mask[:, :, :, -(k + 1)] *= k / feather

                output[:, :, out_y1:out_y2, out_x1:out_x2] += tile_out * mask
                weight[:, :, out_y1:out_y2, out_x1:out_x2] += mask

        output = output / weight.clamp(min=1e-8)
        return output

    def upscale(self, config: dict) -> dict:
        """
        Upscale an image using Real-ESRGAN.

        Args:
            config: dict with keys:
                - image_path (str): Path to input image
                - output_dir (str): Output directory
                - output_name (str, optional): Base output filename
                - model (str): Model filename, default "4x-UltraSharp.pth"
                - tile_size (int): Tile size, default 512
                - tile_overlap (int): Tile overlap, default 32
                - use_fp16 (bool): Use FP16, default True
                - use_two_pass (bool): Two-pass 16x upscale, default False
                - output_format (str): "png" or "tiff", default "png"
                - target_dpi (int, optional): Target DPI
                - target_width_inches (float, optional): Target print width
                - target_height_inches (float, optional): Target print height
                - upscale_factor (int, optional): Simple scale factor (if no print target)

        Returns:
            dict with output_path, output_width, output_height, crop_info
        """
        start_time = time.time()

        image_path = Path(config["image_path"])
        output_dir = Path(config.get("output_dir", os.environ.get("OUTPUT_DIR", "/app/results")))
        model_name = config.get("model", "4x-UltraSharp.pth")
        tile_size = config.get("tile_size", 512)
        tile_overlap = config.get("tile_overlap", 32)
        use_fp16 = config.get("use_fp16", True)
        use_two_pass = config.get("use_two_pass", False)
        output_formats = [config.get("output_format", "png")]
        output_name = config.get("output_name", f"{image_path.stem}_esrgan")

        if not image_path.exists():
            raise FileNotFoundError(f"Input file not found: {image_path}")

        # Load image
        img = cv2.imread(str(image_path))
        if img is None:
            raise ValueError(f"Could not load image: {image_path}")
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        h, w = img.shape[:2]

        # Determine output dimensions
        target_width_inches = config.get("target_width_inches")
        target_height_inches = config.get("target_height_inches")
        dpi = config.get("target_dpi", 150)

        if target_width_inches and target_height_inches:
            scale_info = calculate_scale_for_crop(
                w, h, target_width_inches, target_height_inches, dpi
            )
            output_width = scale_info["output_width_px"]
            output_height = scale_info["output_height_px"]
            crop_info = {
                "direction": scale_info["crop_direction"],
                "amount_px": scale_info["crop_amount_px"],
                "amount_inches": scale_info["crop_amount_inches"],
            } if scale_info["crop_direction"] != "none" else None
        else:
            factor = config.get("upscale_factor", 4)
            output_width = w * factor
            output_height = h * factor
            crop_info = None

        # Load model
        model = self._load_model(model_name, use_fp16)

        # Convert to tensor
        img_tensor = (
            torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0).float() / 255.0
        )
        img_tensor = img_tensor.to(DEVICE)
        if use_fp16 and DEVICE.type == "cuda":
            img_tensor = img_tensor.half()

        # First pass
        output_tensor = self._upscale_with_tiles(model, img_tensor, tile_size, tile_overlap)

        # Optional second pass
        if use_two_pass:
            tile_size_pass2 = min(tile_size, 384)
            output_tensor = self._upscale_with_tiles(
                model, output_tensor, tile_size_pass2, tile_overlap
            )

        # Convert to numpy
        output = output_tensor.squeeze(0).permute(1, 2, 0).float().cpu().numpy()
        output = (output * 255).clip(0, 255).astype(np.uint8)

        # Resize to target dimensions
        pil_img = Image.fromarray(output)
        pil_img = pil_img.resize((output_width, output_height), Image.LANCZOS)
        output_rgb = np.array(pil_img)

        # Save
        saved_paths = save_image_formats(output_rgb, output_name, str(output_dir), output_formats)

        # Cleanup tensors
        del img_tensor, output_tensor
        self._clear_memory()

        processing_time = time.time() - start_time

        return {
            "output_path": saved_paths[0] if saved_paths else None,
            "output_paths": saved_paths,
            "output_width": output_width,
            "output_height": output_height,
            "crop_info": crop_info,
            "processing_time": processing_time,
        }
