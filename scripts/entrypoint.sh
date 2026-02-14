#!/bin/bash
set -e

MODEL_DIR="${MODEL_CACHE_DIR:-/app/models}"

echo "============================================"
echo "  Upscaler API - Container Startup"
echo "============================================"

# Check if essential models exist (at minimum, one upscale model for ESRGAN)
UPSCALE_MODEL="$MODEL_DIR/upscale_models/4x-UltraSharp.pth"

if [ ! -f "$UPSCALE_MODEL" ]; then
    echo ""
    echo "Models not found at $MODEL_DIR"
    echo "Downloading models from HuggingFace (~18GB)..."
    echo "This only happens on first run."
    echo ""
    python3 /app/scripts/download-models.py
    echo ""
fi

# Verify at least ESRGAN models exist
if [ ! -f "$UPSCALE_MODEL" ]; then
    echo "ERROR: Model download failed. Cannot start."
    exit 1
fi

echo ""
echo "Models directory contents:"
find "$MODEL_DIR" -type f -name "*.pth" -o -name "*.gguf" -o -name "*.sft" -o -name "*.safetensors" | while read f; do
    size=$(du -h "$f" | cut -f1)
    echo "  $size  $(basename $f)"
done

echo ""
echo "Starting NestJS API server..."
echo "============================================"

# Start the NestJS application
exec node dist/main
