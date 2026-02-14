"""
Persistent Python Worker Process.

Communicates with NestJS via stdin/stdout JSON-line protocol.
Loads ML models once at startup, processes jobs from NestJS.

Protocol:
  - Reads one JSON object per line from stdin
  - Writes one JSON object per line to stdout
  - Status messages: {"type": "status", "message": "ready|loading_models"}
  - Results: {"type": "result", "job_id": "...", "output_path": "...", "status": "completed", ...}
  - Errors: {"type": "error", "job_id": "...", "error": "...", "traceback": "..."}
"""

import sys
import os
import json
import traceback

# Ensure unbuffered output
os.environ["PYTHONUNBUFFERED"] = "1"


def send_message(msg: dict):
    """Send a JSON message to stdout (NestJS)."""
    print(json.dumps(msg), flush=True)


def main():
    send_message({"type": "status", "message": "loading_models"})

    # Import services (adds ComfyUI to path internally)
    from services.esrgan_upscaler import EsrganUpscaler
    from services.imagen_upscaler import ImagenUpscaler

    # Initialize upscalers
    esrgan = EsrganUpscaler()
    imagen = ImagenUpscaler()

    # FLUX is heavy (~12GB VRAM) — lazy load only when first requested
    flux = None
    flux_loaded = False

    def get_flux():
        nonlocal flux, flux_loaded
        if not flux_loaded:
            send_message({"type": "status", "message": "loading_flux_models"})
            from services.flux_upscaler import FluxUpscaler
            flux = FluxUpscaler()
            flux.load_models()
            flux_loaded = True
            send_message({"type": "status", "message": "flux_models_loaded"})
        return flux

    # Pre-load ESRGAN model (small, fast)
    try:
        esrgan._load_model("4x-UltraSharp.pth")
    except Exception as e:
        send_message({
            "type": "warning",
            "message": f"Could not pre-load ESRGAN model: {e}"
        })

    send_message({"type": "status", "message": "ready"})

    # Process jobs from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        job = {}
        try:
            job = json.loads(line)
            method = job["method"]
            config = job["config"]
            job_id = job["job_id"]

            if method == "esrgan":
                result = esrgan.upscale(config)
            elif method == "flux":
                flux_instance = get_flux()
                result = flux_instance.upscale(config)
            elif method == "imagen":
                result = imagen.upscale(config)
            else:
                raise ValueError(f"Unknown method: {method}")

            send_message({
                "type": "result",
                "job_id": job_id,
                "output_path": result.get("output_path"),
                "output_paths": result.get("output_paths", []),
                "output_width": result.get("output_width"),
                "output_height": result.get("output_height"),
                "crop_info": result.get("crop_info"),
                "processing_time": result.get("processing_time"),
                "status": "completed",
            })

        except Exception as e:
            send_message({
                "type": "error",
                "job_id": job.get("job_id", "unknown"),
                "error": str(e),
                "traceback": traceback.format_exc(),
            })


if __name__ == "__main__":
    main()
