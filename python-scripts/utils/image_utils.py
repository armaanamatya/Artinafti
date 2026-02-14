"""
Image utility functions for encoding, decoding, and saving images.

Extracted from the ESRGAN and Imagen upscaler notebooks.
"""

import base64
import io
import numpy as np
from pathlib import Path
from PIL import Image


def save_image_formats(
    img_array: np.ndarray,
    output_name: str,
    output_dir: str,
    formats: list[str] = None,
) -> list[str]:
    """
    Save image in multiple formats.

    Args:
        img_array: Image as numpy array (H, W, C) in RGB format, uint8
        output_name: Base filename without extension
        output_dir: Output directory path
        formats: List of formats to save, e.g. ["png", "tiff"]

    Returns:
        List of saved file paths
    """
    if formats is None:
        formats = ["png"]

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    pil_img = Image.fromarray(img_array)

    saved_paths = []
    for fmt in formats:
        fmt_lower = fmt.lower()
        if fmt_lower == "png":
            output_path = output_dir / f"{output_name}.png"
            pil_img.save(str(output_path), "PNG")
            saved_paths.append(str(output_path))
        elif fmt_lower in ("tiff", "tif"):
            output_path = output_dir / f"{output_name}.tiff"
            pil_img.save(str(output_path), "TIFF", compression=None)
            saved_paths.append(str(output_path))

    return saved_paths


def encode_image_to_base64(image_path: str) -> str:
    """Read image file and encode to base64."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def decode_base64_to_image(base64_string: str) -> Image.Image:
    """Decode base64 string to PIL Image."""
    image_data = base64.b64decode(base64_string)
    return Image.open(io.BytesIO(image_data))


def pil_to_numpy(img: Image.Image) -> np.ndarray:
    """Convert PIL Image to numpy array (H, W, C) uint8."""
    return np.array(img)


def numpy_to_pil(arr: np.ndarray) -> Image.Image:
    """Convert numpy array (H, W, C) uint8 to PIL Image."""
    return Image.fromarray(arr)
