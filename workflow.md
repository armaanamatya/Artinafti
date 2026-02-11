# Image Upscaling Workflow Documentation

This document explains the two upscaling notebooks in this project and how they process images.

---

## Overview Comparison

| Feature | Real-ESRGAN Notebook | FLUX Notebook |
|---------|---------------------|---------------|
| **Speed** | ~10-60 seconds/image | ~10-20 minutes/image |
| **Method** | Traditional neural upscaler | Diffusion-based AI enhancement |
| **Detail Generation** | Preserves existing details | Can generate new details |
| **Best For** | Fast batch processing, high-quality originals | Maximum quality, detail enhancement |

---

## 1. Real-ESRGAN Standalone Upscaler

**File:** `real_esrgan_upscaler.ipynb`

### Purpose
Fast 4x upscaling using Real-ESRGAN/ESRGAN neural network models without diffusion. Best for:
- Quick batch processing
- Images that already have good quality
- Preview/proofing before final FLUX upscale
- When you don't need AI-generated detail enhancement

### Input Flow

```
input/image.jpg
      │
      ▼
┌─────────────────────┐
│   Load Image        │  cv2.imread() -> RGB conversion
│   (OpenCV)          │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   Convert to        │  numpy -> torch tensor
│   Tensor            │  Shape: (B, C, H, W), normalized 0-1
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   Move to GPU       │  .to(DEVICE), optional FP16
│   (CUDA)            │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   Load Model        │  Spandrel ModelLoader
│   (4x-UltraSharp)   │  Loads .pth upscale model
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   Tiled Upscaling   │  Process in tiles for VRAM efficiency
│   (4x scale)        │  512x512 tiles with 32px overlap
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   Resize to Target  │  Lanczos downscale to print dimensions
│   (Lanczos)         │  e.g., 1650x2100 for 11x14" @ 150 DPI
└─────────────────────┘
      │
      ▼
4xoutput/image_real-esrgan.png
```

### Algorithm Details

#### 1. Image Loading
```python
img = cv2.imread(str(image_path))
img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
```
Loads the image and converts from BGR (OpenCV default) to RGB.

#### 2. Tensor Conversion
```python
img_tensor = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0).float() / 255.0
img_tensor = img_tensor.to(DEVICE)
if use_fp16:
    img_tensor = img_tensor.half()
```
Converts to PyTorch tensor, rearranges dimensions from (H, W, C) to (B, C, H, W), normalizes to 0-1 range.

#### 3. Model Loading (Spandrel)
```python
model = ModelLoader().load_from_file(str(model_path))
model = model.to(DEVICE)
```
Uses Spandrel library to load ESRGAN architecture models. Supports multiple model types automatically.

#### 4. Tiled Processing
The key algorithm for handling large images without running out of VRAM:

```
┌─────────────────────────────────────┐
│  Original Image (e.g., 1024x1024)   │
│  ┌─────┬─────┬─────┬─────┐         │
│  │ T1  │ T2  │ T3  │ T4  │         │
│  ├─────┼─────┼─────┼─────┤         │
│  │ T5  │ T6  │ T7  │ T8  │  ...    │
│  ├─────┼─────┼─────┼─────┤         │
│  │ ... │     │     │     │         │
│  └─────┴─────┴─────┴─────┘         │
└─────────────────────────────────────┘
```

**Tile Processing Steps:**
1. Calculate tile positions with overlap (stride = tile_size - overlap)
2. Extract each tile from input image
3. Run through upscale model (4x)
4. Create feathered weight mask for blending
5. Accumulate to output buffer with weights
6. Normalize final output by accumulated weights

**Feathered Blending:**
- Edges of tiles are gradually weighted down
- Prevents visible seams between tiles
- Overlap region uses weighted average from adjacent tiles

#### 5. Final Resize
```python
pil_img = Image.fromarray(output)
pil_img = pil_img.resize((target_width, target_height), Image.LANCZOS)
```
After 4x upscale, resize to exact print dimensions using high-quality Lanczos filter.

### Available Models

| Model | Description | Best For |
|-------|-------------|----------|
| `4x-UltraSharp.pth` | Sharp details, high contrast | Digital art, graphics |
| `4x_foolhardy_Remacri.pth` | Natural textures, less sharpening | Photographs |
| `4x-AnimeSharp.pth` | Optimized for anime/illustration | Anime, manga |

### Configuration Parameters

```python
DPI = 150                    # Target print DPI
tile_size = 512              # Tile size (lower for less VRAM)
tile_overlap = 32            # Overlap for seamless blending
use_fp16 = True              # Half precision (faster, less VRAM)
upscale_model = "4x-UltraSharp.pth"
```

---

## 2. FLUX Diffusion Upscaler

**File:** `flux_upscaler_5060ti.ipynb`

### Purpose
High-quality AI upscaling using FLUX diffusion model with "Ultimate SD Upscale" tiled processing. Capable of:
- Generating new details via diffusion
- AI-enhanced textures and patterns
- Maximum quality for print production
- Video frame upscaling

### Input Flow

```
input/image.jpg
      │
      ▼
┌─────────────────────┐
│   Load Image        │  ComfyUI LoadImage node
│   (ComfyUI)         │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   Load Models       │
│   - CLIP (text)     │  clip_l.safetensors + t5xxl_fp8
│   - FLUX UNET       │  flux1-dev-Q8_0.gguf (quantized)
│   - VAE             │  ae.sft
│   - Upscaler        │  4x-UltraSharp.pth
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   Encode Prompts    │  CLIPTextEncodeFlux
│   (optional)        │  Positive/negative conditioning
└─────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│   Ultimate SD Upscale                   │
│   ┌─────────────────────────────────┐   │
│   │ 1. Pre-upscale with ESRGAN (4x) │   │
│   │ 2. Split into tiles             │   │
│   │ 3. For each tile:               │   │
│   │    - Encode to latent (VAE)     │   │
│   │    - Add noise                  │   │
│   │    - Denoise with FLUX          │   │
│   │    - Decode from latent (VAE)   │   │
│   │ 4. Blend tiles together         │   │
│   │ 5. Optional seam fix pass       │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
      │
      ▼
4xoutput/image_flux.png
```

### Algorithm Details

#### 1. Model Loading

**CLIP Text Encoders:**
```python
clip = clip_loader.load_clip(
    clip_name1=flux_clip_l,      # CLIP-L for local features
    clip_name2=flux_t5xxl,       # T5-XXL for text understanding
    type="flux"
)[0]
```
Two text encoders provide semantic understanding for conditional generation.

**FLUX UNET (Quantized):**
```python
model = unet_loader.load_unet(unet_name=flux_model)[0]
# flux1-dev-Q8_0.gguf - 8-bit quantized, ~12GB
```
The main diffusion model, quantized to Q8_0 for reduced VRAM usage while maintaining quality.

**VAE:**
```python
vae = vae_loader.load_vae(vae_name=flux_vae)[0]
```
Variational Autoencoder for encoding/decoding between pixel and latent space.

#### 2. Text Conditioning
```python
positive = positive_prompt_encode.encode(
    clip=clip,
    clip_l=positive_prompt,
    t5xxl=positive_prompt2,
    guidance=guidance
)[0]
```
Optional prompts guide the diffusion process. Can improve results by describing desired output.

#### 3. Ultimate SD Upscale Process

This is the core algorithm that combines traditional upscaling with diffusion refinement:

```
┌─────────────────────────────────────────────────────┐
│              ULTIMATE SD UPSCALE FLOW               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Input Image (1024x1024)                           │
│         │                                          │
│         ▼                                          │
│  ┌─────────────────────┐                           │
│  │ ESRGAN Pre-upscale  │  Traditional 4x upscale   │
│  │ (4x-UltraSharp)     │                           │
│  └─────────────────────┘                           │
│         │                                          │
│         ▼                                          │
│  Canvas (4096x4096)                                │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐ │
│  │ T1  │ T2  │ T3  │ T4  │ T5  │ T6  │ T7  │ T8  │ │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤ │
│  │ T9  │ T10 │ ... │     │     │     │     │     │ │
│  │     │     │     │     │     │     │     │     │ │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘ │
│         │                                          │
│         ▼  (for each tile)                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ VAE Encode                                  │   │
│  │   pixel space → latent space (8x smaller)   │   │
│  └─────────────────────────────────────────────┘   │
│         │                                          │
│         ▼                                          │
│  ┌─────────────────────────────────────────────┐   │
│  │ Add Noise (based on denoise strength)       │   │
│  │   denoise=0.2 → slight noise                │   │
│  │   denoise=0.5 → moderate noise              │   │
│  │   denoise=1.0 → full noise (regenerate)     │   │
│  └─────────────────────────────────────────────┘   │
│         │                                          │
│         ▼                                          │
│  ┌─────────────────────────────────────────────┐   │
│  │ FLUX Diffusion (N steps)                    │   │
│  │   Iteratively denoise latent                │   │
│  │   Guided by text conditioning               │   │
│  │   Euler sampler with normal scheduler       │   │
│  └─────────────────────────────────────────────┘   │
│         │                                          │
│         ▼                                          │
│  ┌─────────────────────────────────────────────┐   │
│  │ VAE Decode                                  │   │
│  │   latent space → pixel space                │   │
│  └─────────────────────────────────────────────┘   │
│         │                                          │
│         ▼                                          │
│  Blend tile back into canvas with feathering       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 4. Tile Processing Modes

| Mode | Description |
|------|-------------|
| **Linear** | Process tiles row by row, left to right |
| **Chess** | Alternating pattern (like a checkerboard) for better blending |
| **None** | No upscaling, just diffusion refinement |

#### 5. Seam Fix Options

After initial tiling, optional seam fix pass:
- **Half Tile**: Reprocess half-tile strips at seam boundaries
- **Half Tile + Intersections**: Also fix intersection points
- **Band Pass**: Narrow band processing along seams

### Configuration Parameters

```python
# Upscale Settings
upscale_by = 4              # Scale factor (0.05 to 4.0)
steps = 20                  # Diffusion steps (more = slower, potentially better)
denoise = 0.2               # How much to regenerate (0.0=preserve, 1.0=full regen)
cfg = 7                     # Classifier-free guidance strength
sampler_name = "euler"      # Sampling algorithm
scheduler = "normal"        # Noise schedule

# Tile Settings
tile_width = 512            # Tile size (512 for 16GB, 256-384 for 8GB)
tile_height = 512
tile_padding = 32           # Padding around tiles
mask_blur = 8               # Blur for tile masks

# Text Guidance (optional)
positive_prompt = ""        # Describe desired output
guidance = 3.5              # FLUX guidance scale
```

### Key Parameters Explained

**Denoise Strength:**
- `0.0-0.2`: Subtle enhancement, preserves original closely
- `0.2-0.4`: Moderate enhancement, some detail generation
- `0.4-0.7`: Significant regeneration, may alter content
- `0.7-1.0`: Heavy regeneration, essentially redrawing

**Steps:**
- Rule of thumb: `steps = 20 * denoise`
- More steps = more refinement but slower
- Typical: 15-30 steps

**Tile Size:**
- 512x512: Good for 16GB VRAM
- 384x384: Balanced for 8-12GB VRAM
- 256x256: Safe for 8GB VRAM

---

## Directory Structure

```
Artinafti/
├── input/                      # Source images go here
│   ├── image1.jpg
│   └── image2.jpg
├── 4xoutput/                   # Upscaled results saved here
│   ├── image1_real-esrgan.png
│   └── image1_flux.png
├── hf/                         # HuggingFace/model cache
│   ├── models/
│   │   ├── upscale_models/     # ESRGAN models (.pth)
│   │   ├── unet/               # FLUX model (.gguf)
│   │   ├── vae/                # VAE model (.sft)
│   │   ├── clip/               # Text encoders (.safetensors)
│   │   └── loras/              # Optional LoRA models
│   └── ComfyUI/                # ComfyUI framework
└── resolution-upscaling/
    ├── flux_upscaler_5060ti.ipynb
    ├── real_esrgan_upscaler.ipynb
    └── workflow.md             # This file
```

---

## Recommended Workflow

### For Quick Processing / Batch Jobs
1. Use **Real-ESRGAN notebook**
2. Set `tile_size=512`, `use_fp16=True`
3. Process time: ~30-60 seconds per image

### For Maximum Quality
1. Use **FLUX notebook**
2. Set `denoise=0.2-0.3`, `steps=20`
3. Use prompts if image has specific content
4. Process time: ~10-20 minutes per image

### For Print Production
1. First pass: Real-ESRGAN for quick preview
2. Second pass: FLUX for final print file
3. Target resolution: DPI × print dimensions (e.g., 150 DPI × 11" = 1650px)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Out of VRAM | Reduce `tile_size` to 384 or 256 |
| Visible tile seams | Enable seam fix, increase `tile_overlap` |
| Too much detail change | Lower `denoise` value (try 0.1-0.15) |
| Not enough enhancement | Raise `denoise` value (try 0.3-0.4) |
| Slow processing | Use Real-ESRGAN instead, or reduce `steps` |
