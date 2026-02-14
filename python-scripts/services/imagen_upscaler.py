"""
Google Imagen 4.0 Upscaler Service.

Extracted from resolution-upscaling/imagen_upscaler.ipynb.
Uses Google Cloud Vertex AI API for cloud-based AI upscaling.
"""

import os
import time
import json
import requests
import numpy as np
from pathlib import Path
from PIL import Image

import google.auth
import google.auth.transport.requests

from utils.dimension_calculator import calculate_scale_for_crop
from utils.image_utils import (
    encode_image_to_base64,
    decode_base64_to_image,
    save_image_formats,
)


class ImagenUpscaler:
    def __init__(self):
        self.project_id = os.environ.get("GCP_PROJECT_ID", "artinafti")
        self.region = os.environ.get("GCP_REGION", "us-central1")
        self._credentials = None
        self._project = None

    def _get_credentials(self):
        """Get Google Cloud credentials via Application Default Credentials."""
        if self._credentials is not None:
            return self._credentials

        credentials, project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        self._credentials = credentials
        self._project = project
        return credentials

    def _get_access_token(self) -> str:
        """Get fresh access token from credentials."""
        credentials = self._get_credentials()
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        return credentials.token

    def _call_imagen_api(
        self,
        image_path: str,
        upscale_factor: str = "x4",
        output_mime_type: str = "image/png",
        prompt: str = "Upscale the image with high quality and sharp details",
    ) -> Image.Image:
        """Call Imagen 4.0 upscale API and return PIL Image."""
        endpoint = (
            f"https://{self.region}-aiplatform.googleapis.com/v1/"
            f"projects/{self.project_id}/locations/{self.region}/"
            f"publishers/google/models/imagen-4.0-upscale-preview:predict"
        )

        access_token = self._get_access_token()
        image_base64 = encode_image_to_base64(image_path)

        output_options = {"mimeType": output_mime_type}

        request_body = {
            "instances": [
                {
                    "prompt": prompt,
                    "image": {"bytesBase64Encoded": image_base64},
                }
            ],
            "parameters": {
                "mode": "upscale",
                "upscaleConfig": {"upscaleFactor": upscale_factor},
                "outputOptions": output_options,
            },
        }

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=utf-8",
        }

        response = requests.post(
            endpoint, headers=headers, json=request_body, timeout=300
        )

        if response.status_code != 200:
            error_msg = response.text
            try:
                error_json = response.json()
                if "error" in error_json:
                    error_msg = error_json["error"].get("message", error_msg)
            except Exception:
                pass
            raise Exception(f"Imagen API error ({response.status_code}): {error_msg}")

        result = response.json()
        if "predictions" not in result or len(result["predictions"]) == 0:
            raise Exception("No predictions in API response")

        prediction = result["predictions"][0]
        upscaled_base64 = prediction.get("bytesBase64Encoded")
        if not upscaled_base64:
            raise Exception("No image data in prediction")

        return decode_base64_to_image(upscaled_base64)

    def upscale(self, config: dict) -> dict:
        """
        Upscale an image using Google Imagen 4.0 API.

        Args:
            config: dict with keys:
                - image_path (str): Path to input image
                - output_dir (str): Output directory
                - output_name (str, optional): Base output filename
                - upscale_factor (str): "x2", "x3", or "x4", default "x4"
                - output_format (str): "png" or "tiff", default "png"
                - prompt (str, optional): Upscale prompt
                - gcp_project_id (str, optional): Override GCP project
                - gcp_region (str, optional): Override GCP region
                - target_dpi (int, optional): Target DPI
                - target_width_inches (float, optional): Target print width
                - target_height_inches (float, optional): Target print height

        Returns:
            dict with output_path, output_width, output_height, crop_info
        """
        start_time = time.time()

        image_path = Path(config["image_path"])
        output_dir = Path(config.get("output_dir", os.environ.get("OUTPUT_DIR", "/app/results")))
        output_name = config.get("output_name", f"{image_path.stem}_imagen")
        output_formats = [config.get("output_format", "png")]
        upscale_factor = config.get("upscale_factor", "x4")
        prompt = config.get("prompt", "Upscale the image with high quality and sharp details")

        if config.get("gcp_project_id"):
            self.project_id = config["gcp_project_id"]
        if config.get("gcp_region"):
            self.region = config["gcp_region"]

        if not image_path.exists():
            raise FileNotFoundError(f"Input file not found: {image_path}")

        # Get input dimensions
        with Image.open(image_path) as img:
            input_width, input_height = img.size

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
            scale = int(upscale_factor[1])
            output_width = input_width * scale
            output_height = input_height * scale
            crop_info = None

        # Call Imagen API
        upscaled_img = self._call_imagen_api(
            image_path=str(image_path),
            upscale_factor=upscale_factor,
            prompt=prompt,
        )

        # Resize to exact target dimensions
        final_img = upscaled_img.resize((output_width, output_height), Image.LANCZOS)
        output_rgb = np.array(final_img)

        # Save
        saved_paths = save_image_formats(output_rgb, output_name, str(output_dir), output_formats)

        processing_time = time.time() - start_time

        return {
            "output_path": saved_paths[0] if saved_paths else None,
            "output_paths": saved_paths,
            "output_width": output_width,
            "output_height": output_height,
            "crop_info": crop_info,
            "processing_time": processing_time,
        }
