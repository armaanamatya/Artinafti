#!/usr/bin/env python3
"""
Model Downloader for Upscaler API.

Downloads all required AI models from HuggingFace Hub.
Run this once before starting the container, or let the entrypoint handle it.

Models downloaded (~18GB total):
  - FLUX UNet GGUF: flux1-dev-Q8_0.gguf (~12GB)
  - FLUX VAE: ae.sft (~335MB)
  - FLUX CLIP: clip_l.safetensors (~246MB)
  - FLUX T5: t5xxl_fp8_e4m3fn.safetensors (~4.8GB)
  - Upscale: 4x-UltraSharp.pth (~67MB)
  - Upscale: 4x_foolhardy_Remacri.pth (~67MB)
  - Upscale: 4x-AnimeSharp.pth (~67MB)
"""

import os
import sys
from pathlib import Path

try:
    from huggingface_hub import hf_hub_download
except ImportError:
    print("Installing huggingface_hub...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "huggingface_hub"])
    from huggingface_hub import hf_hub_download


def download_model(repo_id: str, filename: str, dest_dir: Path, subfolder: str = None):
    """Download a model file from HuggingFace Hub if not already present."""
    dest_path = dest_dir / filename
    if dest_path.exists():
        size_mb = dest_path.stat().st_size / (1024 * 1024)
        print(f"  [SKIP] {filename} already exists ({size_mb:.1f} MB)")
        return True

    try:
        hf_filename = f"{subfolder}/{filename}" if subfolder else filename
        print(f"  [DOWNLOADING] {filename}...", flush=True)
        hf_hub_download(
            repo_id=repo_id,
            filename=hf_filename,
            local_dir=str(dest_dir),
            local_dir_use_symlinks=False,
        )

        # If downloaded to subfolder, move to dest_dir root
        if subfolder:
            src = dest_dir / subfolder / filename
            if src.exists():
                src.rename(dest_path)
                try:
                    (dest_dir / subfolder).rmdir()
                except OSError:
                    pass

        size_mb = dest_path.stat().st_size / (1024 * 1024)
        print(f"  [OK] {filename} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"  [FAIL] {filename}: {e}")
        return False


def main():
    models_dir = Path(os.environ.get("MODEL_CACHE_DIR", "/app/models"))

    upscale_dir = models_dir / "upscale_models"
    unet_dir = models_dir / "unet"
    vae_dir = models_dir / "vae"
    clip_dir = models_dir / "clip"

    for d in [upscale_dir, unet_dir, vae_dir, clip_dir]:
        d.mkdir(parents=True, exist_ok=True)

    results = []

    print("\n=== Downloading Upscale Models (~200MB) ===")
    results.append(download_model("Isi99999/Upscalers", "4x-UltraSharp.pth", upscale_dir))
    results.append(download_model("Isi99999/Upscalers", "4x_foolhardy_Remacri.pth", upscale_dir))
    results.append(download_model("Isi99999/Upscalers", "4x-AnimeSharp.pth", upscale_dir))

    print("\n=== Downloading FLUX UNet GGUF (~12GB) ===")
    results.append(download_model("city96/FLUX.1-dev-gguf", "flux1-dev-Q8_0.gguf", unet_dir))

    print("\n=== Downloading FLUX VAE (~335MB) ===")
    results.append(download_model("Isi99999/Upscalers", "ae.sft", vae_dir, subfolder="Flux"))

    print("\n=== Downloading FLUX CLIP Models (~5GB) ===")
    results.append(download_model("Isi99999/Upscalers", "clip_l.safetensors", clip_dir, subfolder="Flux"))
    results.append(download_model("Isi99999/Upscalers", "t5xxl_fp8_e4m3fn.safetensors", clip_dir, subfolder="Flux"))

    success = sum(results)
    total = len(results)
    print(f"\n=== Download Complete: {success}/{total} models ready ===")

    if success < total:
        print("WARNING: Some models failed to download. ESRGAN will still work,")
        print("but FLUX upscaling requires all models.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
