"""
FLUX Upscaler Service.

Extracted from resolution-upscaling/flux_upscaler_5060ti.ipynb.
Uses ComfyUI nodes for FLUX-based diffusion upscaling with tiled processing.
"""

import gc
import os
import sys
import time
import random
import numpy as np
import torch
from pathlib import Path
from PIL import Image

from utils.dimension_calculator import calculate_scale_for_crop
from utils.image_utils import save_image_formats

# ComfyUI path must be on sys.path before importing its modules
COMFYUI_DIR = os.environ.get("COMFYUI_DIR", "/app/hf/ComfyUI")
if COMFYUI_DIR not in sys.path:
    sys.path.insert(0, COMFYUI_DIR)


class FluxUpscaler:
    def __init__(self, models_dir: str = None):
        self.models_dir = Path(models_dir or os.environ.get("MODEL_CACHE_DIR", "/app/models"))
        self.upscale_models_dir = self.models_dir / "upscale_models"
        self.unet_dir = self.models_dir / "unet"
        self.vae_dir = self.models_dir / "vae"
        self.clip_dir = self.models_dir / "clip"
        self.loras_dir = self.models_dir / "loras"

        self._models_loaded = False
        self.model = None
        self.vae = None
        self.positive = None
        self.negative = None
        self.upscale_model_load = None

        # ComfyUI node instances
        self._nodes_initialized = False

    def _init_comfyui_nodes(self):
        """Initialize ComfyUI nodes and configure folder paths."""
        if self._nodes_initialized:
            return

        import folder_paths
        folder_paths.folder_names_and_paths["text_encoders"] = (
            [str(self.clip_dir)], folder_paths.supported_pt_extensions
        )
        folder_paths.folder_names_and_paths["clip"] = (
            [str(self.clip_dir)], folder_paths.supported_pt_extensions
        )
        folder_paths.folder_names_and_paths["vae"] = (
            [str(self.vae_dir)], folder_paths.supported_pt_extensions
        )
        folder_paths.folder_names_and_paths["diffusion_models"] = (
            [str(self.unet_dir)], folder_paths.supported_pt_extensions
        )
        folder_paths.folder_names_and_paths["unet"] = (
            [str(self.unet_dir)], folder_paths.supported_pt_extensions
        )
        folder_paths.folder_names_and_paths["upscale_models"] = (
            [str(self.upscale_models_dir)], folder_paths.supported_pt_extensions
        )
        folder_paths.folder_names_and_paths["loras"] = (
            [str(self.loras_dir)], folder_paths.supported_pt_extensions
        )

        from nodes import DualCLIPLoader, VAELoader, LoadImage
        from custom_nodes.ComfyUI_GGUF.nodes import UnetLoaderGGUF
        from comfy_extras.nodes_upscale_model import UpscaleModelLoader
        from comfy_extras.nodes_flux import CLIPTextEncodeFlux
        from custom_nodes.ComfyUI_UltimateSDUpscale.nodes import UltimateSDUpscale

        self._clip_loader = DualCLIPLoader()
        self._unet_loader = UnetLoaderGGUF()
        self._vae_loader = VAELoader()
        self._load_image = LoadImage()
        self._upscale_model_loader = UpscaleModelLoader()
        self._positive_prompt_encode = CLIPTextEncodeFlux()
        self._negative_prompt_encode = CLIPTextEncodeFlux()
        self._upscaler = UltimateSDUpscale()

        self._nodes_initialized = True

    def _clear_memory(self):
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        gc.collect()

    def load_models(
        self,
        flux_model: str = "flux1-dev-Q8_0.gguf",
        flux_vae: str = "ae.sft",
        flux_clip_l: str = "clip_l.safetensors",
        flux_t5xxl: str = "t5xxl_fp8_e4m3fn.safetensors",
        upscale_model: str = "4x-UltraSharp.pth",
        guidance: float = 3.5,
    ):
        """Load all FLUX models into GPU memory. Called once at startup."""
        if self._models_loaded:
            return

        self._init_comfyui_nodes()

        # Load CLIP and encode empty prompts
        clip = self._clip_loader.load_clip(flux_t5xxl, flux_clip_l, "flux")[0]
        self.positive = self._positive_prompt_encode.encode(clip, "", "", guidance)[0]
        self.negative = self._negative_prompt_encode.encode(clip, "", "", guidance)[0]

        del clip
        self._clear_memory()

        # Load UNet
        self.model = self._unet_loader.load_unet(flux_model)[0]

        # Load upscale model
        self.upscale_model_load = self._upscale_model_loader.load_model(upscale_model)[0]

        # Load VAE
        self.vae = self._vae_loader.load_vae(flux_vae)[0]

        self._models_loaded = True

    def upscale(self, config: dict) -> dict:
        """
        Upscale an image using FLUX diffusion.

        Args:
            config: dict with keys:
                - image_path (str): Path to input image
                - output_dir (str): Output directory
                - output_name (str, optional): Base output filename
                - upscale_by (float): Scale factor, default 4
                - denoise (float): AI regeneration strength 0.0-1.0, default 0.2
                - steps (int): Diffusion steps, default 20
                - seed (int): Random seed, 0 = random
                - cfg (float): CFG scale, default 7
                - sampler_name (str): Sampler, default "euler"
                - scheduler (str): Scheduler, default "normal"
                - upscale_model (str): Upscale model name
                - tile_width (int): Tile width, default 512
                - tile_height (int): Tile height, default 512
                - mask_blur (int): Mask blur, default 8
                - tile_padding (int): Tile padding, default 32
                - output_format (str): "png" or "tiff", default "png"
                - target_dpi (int, optional): Target DPI
                - target_width_inches (float, optional): Target print width
                - target_height_inches (float, optional): Target print height
                - positive_prompt (str, optional): Positive prompt
                - guidance (float, optional): Guidance scale, default 3.5

        Returns:
            dict with output_path, output_width, output_height, crop_info
        """
        if not self._models_loaded:
            self.load_models(
                upscale_model=config.get("upscale_model", "4x-UltraSharp.pth"),
                guidance=config.get("guidance", 3.5),
            )

        start_time = time.time()

        image_path = Path(config["image_path"])
        output_dir = Path(config.get("output_dir", os.environ.get("OUTPUT_DIR", "/app/results")))
        output_name = config.get("output_name", f"{image_path.stem}_flux")
        output_formats = [config.get("output_format", "png")]

        upscale_by = config.get("upscale_by", 4)
        denoise = config.get("denoise", 0.2)
        steps = config.get("steps", 20)
        seed = config.get("seed", 0)
        cfg = config.get("cfg", 7)
        sampler_name = config.get("sampler_name", "euler")
        scheduler = config.get("scheduler", "normal")
        tile_width = config.get("tile_width", 512)
        tile_height = config.get("tile_height", 512)
        mask_blur = config.get("mask_blur", 8)
        tile_padding = config.get("tile_padding", 32)

        if seed == 0:
            seed = random.randint(0, 2**32 - 1)

        if not image_path.exists():
            raise FileNotFoundError(f"Input file not found: {image_path}")

        # Load image via ComfyUI
        loaded_image = self._load_image.load_image(str(image_path))[0]
        input_height, input_width = loaded_image.shape[1], loaded_image.shape[2]

        # Determine output dimensions
        target_width_inches = config.get("target_width_inches")
        target_height_inches = config.get("target_height_inches")
        dpi = config.get("target_dpi", 150)

        if target_width_inches and target_height_inches:
            scale_info = calculate_scale_for_crop(
                input_width, input_height,
                target_width_inches, target_height_inches, dpi,
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
            output_width = int(input_width * factor)
            output_height = int(input_height * factor)
            crop_info = None

        # Re-encode prompts if custom prompt provided
        positive = self.positive
        negative = self.negative
        custom_prompt = config.get("positive_prompt")
        if custom_prompt:
            self._init_comfyui_nodes()
            clip = self._clip_loader.load_clip(
                "t5xxl_fp8_e4m3fn.safetensors", "clip_l.safetensors", "flux"
            )[0]
            guidance_val = config.get("guidance", 3.5)
            positive = self._positive_prompt_encode.encode(
                clip, custom_prompt, "", guidance_val
            )[0]
            del clip
            self._clear_memory()

        # Run FLUX upscale
        with torch.inference_mode():
            image_out = self._upscaler.upscale(
                image=loaded_image,
                model=self.model,
                positive=positive,
                negative=negative,
                vae=self.vae,
                upscale_by=upscale_by,
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler_name=sampler_name,
                scheduler=scheduler,
                denoise=denoise,
                upscale_model=self.upscale_model_load,
                mode_type="Linear",
                tile_width=tile_width,
                tile_height=tile_height,
                mask_blur=mask_blur,
                tile_padding=tile_padding,
                seam_fix_mode="None",
                seam_fix_denoise=1.0,
                seam_fix_mask_blur=8,
                seam_fix_width=64,
                seam_fix_padding=16,
                force_uniform_tiles=True,
                tiled_decode=False,
            )[0]

        # Resize to target dimensions
        img_np = (image_out[0].cpu().numpy() * 255).astype(np.uint8)
        pil_img = Image.fromarray(img_np)
        pil_img = pil_img.resize((output_width, output_height), Image.LANCZOS)
        output_rgb = np.array(pil_img)

        # Save
        saved_paths = save_image_formats(output_rgb, output_name, str(output_dir), output_formats)

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
