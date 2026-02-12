# Image Upscaling Notebooks - Technical Guide

This document explains how each upscaling notebook works, including image processing flow, transformations, and when to use each approach.

---

## Table of Contents

1. [FLUX Upscaler (Colab)](#1-flux-upscaler-colab)
2. [FLUX Upscaler 2x Evaluation Mode](#2-flux-upscaler-2x-evaluation-mode)
3. [FLUX Upscaler (Local - RTX 5060 Ti)](#3-flux-upscaler-local---rtx-5060-ti)
4. [Google Imagen 4.0 Upscaler](#4-google-imagen-40-upscaler)
5. [Real-ESRGAN 2x Evaluation Mode](#5-real-esrgan-2x-evaluation-mode)
6. [Real-ESRGAN Standard Upscaler](#6-real-esrgan-standard-upscaler)
7. [Comparison Table](#comparison-table)

---

## 1. FLUX Upscaler (Colab)

**File:** `Another_copy_of_Flux_Upscaler.ipynb`

### Overview
AI-powered upscaling using FLUX.1-dev with ComfyUI's UltimateSDUpscale node. Designed for Google Colab with T4 GPU.

### Image Processing Flow

```
Input Image
    ↓
[1] Load Image → RGB tensor (normalized 0-1)
    ↓
[2] Load Models:
    - FLUX CLIP (text encoder): t5xxl_fp8_e4m3fn.safetensors + clip_l.safetensors
    - FLUX UNet (diffusion model): flux1-dev-Q8_0.gguf (quantized)
    - VAE (image encoder/decoder): ae.sft
    - Upscale Model: 4x-UltraSharp.pth (or others)
    - Optional LoRA: flux_realism_lora.safetensors
    ↓
[3] Encode Prompts:
    - Positive prompt → CLIP embeddings (guidance conditioning)
    - Negative prompt → CLIP embeddings (what to avoid)
    ↓
[4] Upscale with UltimateSDUpscale:
    a) Initial upscale: Input × 4x (using 4x-UltraSharp.pth)
       - Example: 682×1024 → 2728×4096

    b) Tiled processing (to fit in VRAM):
       - Split into tiles (default 512×512 with 32px padding)
       - For each tile:
         * Encode with VAE → latent space
         * Apply FLUX diffusion (denoise steps)
         * Decode with VAE → pixel space
       - Blend tiles with feathering (Linear/Chess mode)

    c) Optional seam fixing:
       - Additional pass on tile boundaries
       - Reduces visible seams between tiles
    ↓
[5] Output: Upscaled image (4x resolution)
    - Convert tensor → numpy → PIL Image
    - Save as PNG
```

### Key Parameters

| Parameter | Effect | Default |
|-----------|--------|---------|
| `upscale_by` | Scale factor (0.05-4.0) | 2.0 |
| `denoise` | AI regeneration strength (0.0-1.0) | 0.2 |
| `steps` | Diffusion iterations | 20 |
| `tile_width/height` | Tile size for processing | 512×512 |
| `seam_fix_mode` | Tile blending method | "Half Tile" |
| `positive_prompt` | Optional guidance prompt | "" |

### Image Transformations

1. **Resizing**: None (input stays same size until upscale)
2. **Color Space**: RGB throughout
3. **Normalization**: Values scaled to 0-1 range
4. **Upscaling**: 4x using ESRGAN model + FLUX refinement
5. **Downsizing**: None (output is 4x input size)

### When to Use
- Highest quality AI-enhanced upscaling
- When you have time (10-40 minutes per image)
- For photos, artwork, or any content needing detail reconstruction
- When running on Google Colab with free GPU

---

## 2. FLUX Upscaler 2x Evaluation Mode

**File:** `flux_upscaler_2x_eval.ipynb`

### Overview
Evaluation version that upscales to **2x the target print size** for quality inspection before final output.

### Image Processing Flow

```
Input Image (e.g., 682×1024)
    ↓
[1] Calculate 2x Evaluation Dimensions:
    - Original target: 11"×14" @ 150 DPI = 1650×2100 px
    - Evaluation size: 22"×28" @ 150 DPI = 3300×4200 px
    ↓
[2] Aspect Ratio Analysis:
    - Input aspect: 682÷1024 = 0.666
    - Target aspect: 22÷28 = 0.785
    - Crop direction: VERTICAL (input is narrower)
    ↓
[3] Calculate Pre-Crop Output Size:
    - Match width: 3300 px
    - Scale factor: 3300÷682 = 4.84x
    - Pre-crop height: 1024×4.84 = 4957 px
    - Excess height: 4957-4200 = 757 px (to be cropped)
    ↓
[4] FLUX Upscale (4x):
    - 682×1024 → 2728×4096
    ↓
[5] Resize to Pre-Crop Size:
    - 2728×4096 → 3300×4957 (Lanczos interpolation)
    ↓
[6] Save Output:
    - PNG: Lossless, widely compatible
    - TIFF: Uncompressed, best for print workflows
    ↓
[7] Human Crops Later:
    - Crop 757 px vertically to get 3300×4200 px
    - Final print: 22"×28" @ 150 DPI
```

### Image Transformations

1. **Resizing**:
   - Input: 682×1024
   - After 4x upscale: 2728×4096
   - Final resize: 3300×4957 (Lanczos)

2. **Aspect Ratio Handling**:
   - Output is intentionally oversized in one dimension
   - Allows manual cropping for perfect framing

3. **Downsizing**:
   - Yes, after 4x upscale (2728×4096 → 3300×4957)
   - High-quality Lanczos interpolation

### When to Use
- Before final production upscale
- To check for pixelation at 100% zoom in Photoshop
- When you want to verify quality before committing 20+ minutes

---

## 3. FLUX Upscaler (Local - RTX 5060 Ti)

**File:** `flux_upscaler_5060ti.ipynb`

### Overview
Local Windows version with custom print size targeting and aspect-ratio-aware scaling.

### Image Processing Flow

```
Input Image (e.g., 1024×587 for 20"×10" print)
    ↓
[1] Configuration:
    - Target: 20"×10" @ 150 DPI = 3000×1500 px
    - DPI: 150
    - Output formats: ["png", "tiff"]
    ↓
[2] Aspect Ratio Calculation:
    - Input aspect: 1024÷587 = 1.744
    - Target aspect: 20÷10 = 2.000
    - Difference: Input is slightly taller

    Pre-crop strategy:
    - Match target height: 1500 px
    - Scale factor: 1500÷587 = 2.555x
    - Pre-crop width: 1024×2.555 = 2616 px
    - Final width: 3000 px
    - Excess width: 2616-3000 = -384 px

    Actually, it matches width instead:
    - Match target width: 3000 px
    - Scale factor: 3000÷1024 = 2.93x
    - Pre-crop height: 587×2.93 = 1719 px
    - Excess height: 1719-1500 = 219 px (vertical crop)
    ↓
[3] FLUX Upscale (4x):
    - 1024×587 → 4096×2348
    - Tiled processing with 512×512 tiles
    - Denoise: 0.2 (20% AI regeneration)
    - Steps: 20 (diffusion iterations)
    ↓
[4] Resize to Pre-Crop Size:
    - 4096×2348 → 3000×1719 (Lanczos)
    ↓
[5] Save Multiple Formats:
    - PNG: b46bc519..._flux-upscaler.png
    - TIFF: b46bc519..._flux-upscaler.tiff
    ↓
[6] Crop Instructions:
    - Direction: VERTICAL
    - Amount: 219 px (1.46")
    - Final: 3000×1500 px = 20"×10" @ 150 DPI
```

### Image Transformations

1. **Resizing**:
   - Input: 1024×587
   - After 4x: 4096×2348
   - Final: 3000×1719 (with 219px vertical crop needed)

2. **Aspect Ratio Preservation**:
   - Scales to match one dimension exactly
   - Leaves excess in other dimension for manual cropping

3. **Downsizing**:
   - Yes (4096→3000 width, 2348→1719 height)

### When to Use
- Local processing on RTX 5060 Ti (faster than Colab)
- Custom print sizes with exact DPI requirements
- When you need both PNG and TIFF outputs
- Production-ready final upscaling

---

## 4. Google Imagen 4.0 Upscaler

**File:** `imagen_upscaler.ipynb`

### Overview
Cloud-based upscaling using Google's Imagen 4.0 API on Vertex AI. No local GPU required.

### Image Processing Flow

```
Input Image
    ↓
[1] Load and Encode:
    - Read image file
    - Encode to base64 string
    ↓
[2] API Request to Imagen 4.0:
    {
      "instances": [
        {
          "prompt": "Upscale the image with high quality",
          "image": { "bytesBase64Encoded": "..." }
        }
      ],
      "parameters": {
        "mode": "upscale",
        "upscaleConfig": { "upscaleFactor": "x4" },
        "outputOptions": { "mimeType": "image/png" }
      }
    }
    ↓
[3] Imagen Processing (Cloud):
    - AI-enhanced upscaling
    - Input × 4 (or ×2, ×3 depending on config)
    - Example: 682×1024 → 2728×4096
    - Processing time: ~15-20 seconds
    ↓
[4] Decode Response:
    - Receive base64-encoded result
    - Decode to PIL Image
    ↓
[5] Resize to Target Dimensions:
    - Example: 2728×4096 → 1500×3000 (Lanczos)
    ↓
[6] Save as PNG
```

### Image Transformations

1. **Resizing**:
   - Input: 682×1024
   - After Imagen 4x: 2728×4096
   - Final resize: 1500×3000

2. **Color Space**: RGB throughout
3. **Compression**: PNG (lossless) or JPEG (quality 90)
4. **Downsizing**: Yes, after cloud upscale

### When to Use
- No local GPU available
- Fastest processing (15-20 seconds per image)
- Good quality AI enhancement
- When you have Google Cloud credits
- Batch processing multiple images

### Cost Considerations
- Vertex AI API charges per request
- Approximately $0.10-0.50 per image (check current pricing)

---

## 5. Real-ESRGAN 2x Evaluation Mode

**File:** `real_esrgan_2x_eval.ipynb`

### Overview
Fast evaluation mode using Real-ESRGAN with **16x upscaling** (two passes of 4x) for 2x print size testing.

### Image Processing Flow

```
Input Image (e.g., 682×1024)
    ↓
[1] Calculate 2x Evaluation Size:
    - Original target: 20"×10" @ 150 DPI
    - Evaluation: 40"×20" @ 150 DPI = 6000×3000 px
    ↓
[2] Load Spandrel Model:
    - 4x-UltraSharp.pth
    - Model scale: 4x
    ↓
[3] Convert to Tensor:
    - RGB image → PyTorch tensor
    - Normalize to 0-1 range
    - Move to GPU (CUDA)
    - Convert to FP16 (half precision) for speed
    ↓
[4] Pass 1 - First 4x Upscale:
    - 682×1024 → 2728×4096
    - Tiled processing (6 tiles: 3×2)
    - Tile size: 512×512 with 32px overlap
    - Blending with feathering to hide seams
    - Time: ~8 seconds
    ↓
[5] Pass 2 - Second 4x Upscale:
    - 2728×4096 → 10912×16384 (16x total!)
    - Smaller tiles (384×384) due to larger image
    - 96 tiles (12×8)
    - Blending with feathering
    - Time: ~69 seconds
    ↓
[6] Convert Back to Image:
    - Tensor → numpy array
    - Denormalize (×255) → uint8
    ↓
[7] Resize to Pre-Crop Size:
    - 10912×16384 → 6000×9008 (Lanczos)
    ↓
[8] Save Output:
    - PNG: Lossless
    - TIFF: Uncompressed
    ↓
[9] Crop Information:
    - Direction: VERTICAL
    - Amount: 6008 px (40.05")
    - Final: 6000×3000 px = 40"×20" @ 150 DPI
```

### Image Transformations

1. **Resizing**:
   - Input: 682×1024
   - After 16x: 10912×16384
   - Final: 6000×9008

2. **Two-Pass Upscaling**:
   - First pass: 4x (682→2728, 1024→4096)
   - Second pass: 4x (2728→10912, 4096→16384)
   - Total: 16x magnification

3. **Downsizing**:
   - Yes, massive downsize (10912→6000, 16384→9008)
   - Lanczos interpolation

### When to Use
- Quick quality preview (~90 seconds vs 20+ minutes for FLUX)
- Before committing to slow FLUX upscale
- When original image quality is already decent
- Testing multiple upscale models quickly

---

## 6. Real-ESRGAN Standard Upscaler

**File:** `real_esrgan_upscaler.ipynb`

### Overview
Fast standalone upscaler using Real-ESRGAN models without diffusion AI.

### Image Processing Flow

```
Input Image (e.g., 1024×816)
    ↓
[1] Configuration:
    - Target: 20"×10" @ 150 DPI = 3000×1500 px
    - Model: 4x-UltraSharp.pth
    - Two-pass: True (16x total)
    ↓
[2] Aspect Ratio Calculation:
    - Input: 1024×816 (aspect 1.255)
    - Target: 3000×1500 (aspect 2.000)
    - Pre-crop size: 3000×2390 px
    - Vertical crop needed: 890 px
    ↓
[3] Load Spandrel Model:
    - 4x-UltraSharp.pth
    - Move to GPU (CUDA FP16)
    ↓
[4] Pass 1 - First 4x Upscale:
    - 1024×816 → 4096×3264
    - Tiled processing (6 tiles)
    - Time: ~7 seconds
    ↓
[5] Pass 2 - Second 4x Upscale:
    - 4096×3264 → 16384×13056
    - 120 tiles (10×12)
    - Time: ~82 seconds
    ↓
[6] Resize to Pre-Crop Size:
    - 16384×13056 → 3000×2390 (Lanczos)
    ↓
[7] Save Multiple Formats:
    - PNG: df5cc4ff..._real-esrgan.png
    - TIFF: df5cc4ff..._real-esrgan.tiff
    ↓
[8] Crop Instructions:
    - Vertical crop: 890 px (5.93")
    - Final: 3000×1500 px
```

### Image Transformations

1. **Resizing**:
   - Input: 1024×816
   - After 16x: 16384×13056
   - Final: 3000×2390

2. **Two-Pass 16x Upscaling**:
   - Provides higher quality than single 4x pass
   - More detail reconstruction

3. **Downsizing**:
   - Yes (16384→3000, 13056→2390)

### When to Use
- Fast batch processing (~95 seconds per image)
- Good quality without AI diffusion overhead
- When source images are already high quality
- Preview before FLUX final upscale
- Limited GPU VRAM (uses tiling)

---

## Comparison Table

| Notebook | Method | Speed | Quality | GPU Required | Upscale Factor | Output Size Control |
|----------|--------|-------|---------|--------------|----------------|---------------------|
| FLUX Colab | FLUX + ESRGAN | Slow (10-40 min) | Highest | Yes (Colab T4) | 4x | Fixed 4x |
| FLUX 2x Eval | FLUX + ESRGAN | Slow (10-40 min) | Highest | Yes (Colab T4) | 4x → resize | 2x print size |
| FLUX RTX 5060 Ti | FLUX + ESRGAN | Slow (10-40 min) | Highest | Yes (RTX 5060 Ti) | 4x → resize | Custom print size |
| Imagen 4.0 | Cloud API | Fast (15-20 sec) | High | No (cloud) | 2x/3x/4x | Custom after API |
| Real-ESRGAN 2x Eval | ESRGAN only | Medium (90 sec) | Good | Yes (local) | 16x → resize | 2x print size |
| Real-ESRGAN Standard | ESRGAN only | Medium (95 sec) | Good | Yes (local) | 16x → resize | Custom print size |

---

## Key Concepts

### Denoise Parameter
- **Range**: 0.0 to 1.0
- **0.0**: Pure upscaling, no AI regeneration
- **0.2**: 20% AI regeneration (default, recommended)
- **0.5**: 50% AI regeneration (more changes to original)
- **1.0**: Full AI regeneration (may deviate significantly)

**Rule of thumb**: Steps = 20 × denoise value

### Tiled Processing
Because upscaling creates huge images that don't fit in VRAM:
1. Split image into overlapping tiles (512×512)
2. Process each tile independently
3. Blend tiles with feathering (gradual transition)
4. Optional seam fixing pass to reduce visible boundaries

### Aspect Ratio Handling
When input aspect doesn't match target:
1. Calculate which dimension to match (width or height)
2. Scale to match that dimension
3. Leave excess in other dimension
4. User crops manually to final size

This preserves flexibility for framing/composition.

### Two-Pass Upscaling
For 16x total magnification:
- **Pass 1**: 4x upscale (fast, manageable size)
- **Pass 2**: 4x upscale on result (slower, larger tiles)
- **Benefit**: Better quality than direct 16x, but slower

### Output Formats
- **PNG**: Lossless, widely compatible, larger file size
- **TIFF**: Uncompressed, best for print workflows, huge files
- **JPEG**: Lossy compression, smaller files, quality loss

---

## Recommended Workflow

1. **Quick Test** (5 min):
   - Use Real-ESRGAN 2x Eval
   - Check for pixelation at 100% zoom

2. **If Quality Good** (20 min):
   - Use FLUX RTX 5060 Ti for final production
   - Get both PNG and TIFF outputs

3. **If No GPU** (1 min):
   - Use Imagen 4.0 (cloud)
   - Fast, good quality, costs money

4. **Batch Processing**:
   - Use Real-ESRGAN Standard (fastest)
   - Or Imagen 4.0 (if budget allows)

---

## Troubleshooting

### Memory Errors
- Reduce `tile_size` (512 → 384 → 256)
- Enable `use_fp16` for half precision
- Reduce `upscale_by` factor

### Poor Quality
- Increase `denoise` (0.2 → 0.3)
- Increase `steps` (20 → 40)
- Try different upscale model (4x_foolhardy_Remacri.pth)

### Visible Seams
- Enable `seam_fix_mode` ("Half Tile")
- Increase `tile_overlap` (32 → 64)
- Reduce `tile_size` for more overlap

### Slow Processing
- Use Real-ESRGAN instead of FLUX
- Use Imagen 4.0 (cloud API)
- Reduce image count or resolution
