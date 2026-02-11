# Imagen 4.0 Upscale Implementation Plan

## Overview

Replace local upscaling models (Real-ESRGAN, FLUX) with Google's **imagen-4.0-upscale-preview** API on Vertex AI for AI-powered image upscaling.

## What Imagen 4.0 Upscale Does

- AI-powered image upscaling that increases resolution without losing quality
- Supports **2x, 3x, and 4x** upscale factors
- Cloud-based processing (no local GPU required)
- Output formats: PNG or JPEG with configurable compression

## Setup Requirements

### 1. Google Cloud Project Setup

```bash
# Enable required APIs
gcloud services enable aiplatform.googleapis.com compute.googleapis.com

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

### 2. Authentication

```bash
# Initialize gcloud CLI
gcloud init

# Create Application Default Credentials
gcloud auth application-default login
```

### 3. Python Dependencies

```bash
pip install google-cloud-aiplatform google-auth requests pillow
```

## API Details

### Endpoint
```
POST https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{REGION}/publishers/google/models/imagen-4.0-upscale-preview:predict
```

### Request Format
```json
{
  "instances": [
    {
      "prompt": "Upscale the image",
      "image": {
        "bytesBase64Encoded": "BASE64_IMAGE_DATA"
      }
    }
  ],
  "parameters": {
    "mode": "upscale",
    "upscaleConfig": {
      "upscaleFactor": "x2" | "x3" | "x4"
    },
    "outputOptions": {
      "mimeType": "image/png" | "image/jpeg",
      "compressionQuality": 0-100
    }
  }
}
```

### Response Format
```json
{
  "predictions": [
    {
      "mimeType": "image/png",
      "bytesBase64Encoded": "BASE64_UPSCALED_IMAGE"
    }
  ]
}
```

## Implementation Tasks

### Task 1: Create Notebook Structure
- Setup cell with Google Cloud authentication
- Configuration cell for API settings
- Upscale function cell
- Batch processing cell

### Task 2: Core Functions
- `get_access_token()` - Get OAuth token for API auth
- `encode_image_to_base64()` - Convert local image to base64
- `upscale_image()` - Call Imagen API and handle response
- `decode_and_save()` - Decode base64 response and save

### Task 3: Configuration Options
- PROJECT_ID and REGION settings
- Upscale factor (x2, x3, x4)
- Output format (PNG/JPEG)
- Compression quality
- Batch image configs (like existing notebooks)
- Target DPI and print size calculations

### Task 4: Error Handling
- API quota limits
- Authentication failures
- Invalid image formats
- Network timeouts

## Comparison with Current Solutions

| Feature | Real-ESRGAN | FLUX | Imagen 4.0 |
|---------|-------------|------|------------|
| Speed | Fast (10-60s) | Slow (10-20min) | Medium (API latency) |
| GPU Required | Yes (local) | Yes (local) | No (cloud) |
| Max Upscale | 4x (16x 2-pass) | 4x | 4x |
| Cost | Free (hardware) | Free (hardware) | API pricing |
| Quality | Good | Excellent | TBD |

## Files to Create

1. `resolution-upscaling/imagen_upscaler.ipynb` - Main notebook using Imagen API

## Notes

- Imagen 4.0 upscale is in **Preview** status
- Requires active Google Cloud billing account
- API pricing applies per image processed
- Images must be under API size limits
