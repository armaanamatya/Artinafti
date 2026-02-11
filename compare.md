# Upscaling Pipeline Comparison

## Overview

| Notebook | Speed | Quality | Use Case |
|----------|-------|---------|----------|
| **Real-ESRGAN Standalone** | ~30-60 sec | Good (faithful) | Fast preview, batch processing |
| **FLUX Local (5060 Ti)** | ~10-20 min | Excellent (AI-enhanced) | Final production, detail generation |
| **FLUX Colab (Original)** | ~15-30 min | Excellent (AI-enhanced) | Cloud processing, no local GPU |

---

## 1. Real-ESRGAN Standalone Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     REAL-ESRGAN STANDALONE PIPELINE                         │
│                          (Fast Mode ~30-60s)                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ INPUT IMAGE  │
│ (1024x1024)  │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    SPANDREL MODEL LOADER                      │
│  Loads ESRGAN/Real-ESRGAN architecture models directly        │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   4x-UltraSharp.pth                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Type: ESRGAN (Enhanced Super-Resolution GAN)           │ │
│  │  Architecture: RRDB (Residual-in-Residual Dense Block)  │ │
│  │  Scale: 4x fixed                                        │ │
│  │  Size: ~67MB                                            │ │
│  │  VRAM: ~2-4GB                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  WHY THIS MODEL:                                             │
│  - Fast inference (single forward pass)                      │
│  - No diffusion = no iterative denoising                     │
│  - Trained on sharp/detailed images                          │
│  - Good for already high-quality sources                     │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    TILED PROCESSING                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Tile Size: 512x512 (configurable)                      │ │
│  │  Overlap: 32px (feathered blending)                     │ │
│  │  Purpose: Handle large images without OOM               │ │
│  │                                                         │ │
│  │  ┌─────┬─────┬─────┐                                    │ │
│  │  │  1  │  2  │  3  │  Image split into tiles            │ │
│  │  ├─────┼─────┼─────┤  Each tile processed separately    │ │
│  │  │  4  │  5  │  6  │  Results blended with feathering   │ │
│  │  ├─────┼─────┼─────┤                                    │ │
│  │  │  7  │  8  │  9  │                                    │ │
│  │  └─────┴─────┴─────┘                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────┐
│OUTPUT IMAGE  │
│ (4096x4096)  │
│ _esrgan.png  │
└──────────────┘
```

### Real-ESRGAN Model Options

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         AVAILABLE MODELS                                    │
├────────────────────────┬───────────────────────────────────────────────────┤
│ 4x-UltraSharp.pth      │ Sharp details, good for digital art (DEFAULT)    │
├────────────────────────┼───────────────────────────────────────────────────┤
│ 4x_foolhardy_Remacri   │ Natural textures, less over-sharpening           │
├────────────────────────┼───────────────────────────────────────────────────┤
│ 4x-AnimeSharp.pth      │ Optimized for anime/illustration style           │
└────────────────────────┴───────────────────────────────────────────────────┘
```

---

## 2. FLUX Local Pipeline (RTX 5060 Ti)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FLUX LOCAL PIPELINE (5060 Ti)                          │
│                        (High Quality ~10-20 min)                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ INPUT IMAGE  │
│ (1024x1024)  │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                 STEP 1: TEXT ENCODING                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  clip_l.safetensors (~250MB)                            │ │
│  │  - OpenAI CLIP ViT-L/14 text encoder                    │ │
│  │  - Encodes prompts into embeddings                      │ │
│  │                                                         │ │
│  │  t5xxl_fp8_e4m3fn.safetensors (~4.5GB)                  │ │
│  │  - Google T5-XXL text encoder (FP8 quantized)           │ │
│  │  - Provides rich semantic understanding                 │ │
│  │                                                         │ │
│  │  WHY: FLUX needs text conditioning even for upscaling   │ │
│  │       Empty prompt = neutral conditioning               │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 STEP 2: INITIAL UPSCALE                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  4x-UltraSharp.pth (~67MB)                              │ │
│  │  - Same ESRGAN model as standalone                      │ │
│  │  - Provides 4x resolution increase                      │ │
│  │  - Fast, deterministic upscale                          │ │
│  │                                                         │ │
│  │  WHY: Gets image to target resolution BEFORE diffusion  │ │
│  │       Diffusion works better on higher-res images       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  1024x1024 ──────────────────────────────────► 4096x4096    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 STEP 3: VAE ENCODING                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  ae.sft (~335MB) - FLUX VAE                             │ │
│  │  - Variational Autoencoder                              │ │
│  │  - Compresses image to latent space (8x downscale)      │ │
│  │  - 4096x4096 image → 512x512 latent                     │ │
│  │                                                         │ │
│  │  WHY: Diffusion operates in latent space (faster)       │ │
│  │       Latent = compressed representation of image       │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 STEP 4: DIFFUSION REFINEMENT                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  flux1-dev-Q8_0.gguf (~12GB) - FLUX.1-dev model         │ │
│  │  - Diffusion Transformer (DiT) architecture             │ │
│  │  - Q8 quantized (8-bit) for reduced VRAM                │ │
│  │  - 12B parameters                                       │ │
│  │                                                         │ │
│  │  PROCESS (Ultimate SD Upscale):                         │ │
│  │  ┌─────────────────────────────────────────────────────┐│ │
│  │  │ For each 512x512 tile:                              ││ │
│  │  │   1. Add noise (controlled by denoise=0.2)          ││ │
│  │  │   2. Run 20 diffusion steps                         ││ │
│  │  │   3. Denoise while adding coherent detail           ││ │
│  │  │   4. Blend with neighboring tiles                   ││ │
│  │  └─────────────────────────────────────────────────────┘│ │
│  │                                                         │ │
│  │  WHY FLUX:                                              │ │
│  │  - Can "imagine" detail that wasn't in original        │ │
│  │  - Texture-aware: understands fabric, skin, etc.       │ │
│  │  - Maintains coherence across tiles                    │ │
│  │  - Better than SD 1.5/SDXL for this task               │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 STEP 5: VAE DECODING                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  ae.sft (same VAE)                                      │ │
│  │  - Decodes latent back to pixel space                   │ │
│  │  - 512x512 latent → 4096x4096 image                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────┐
│OUTPUT IMAGE  │
│ (4096x4096)  │
│ _flux.png    │
└──────────────┘
```

### FLUX Model Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUX MODEL STACK                                      │
├─────────────────────────┬───────────────────┬───────────────────────────────┤
│ Component               │ File              │ Purpose                       │
├─────────────────────────┼───────────────────┼───────────────────────────────┤
│ FLUX Diffusion Model    │ flux1-dev-Q8.gguf │ Core image generation/refine  │
│ (DiT - 12B params)      │ ~12GB             │ Adds detail via diffusion     │
├─────────────────────────┼───────────────────┼───────────────────────────────┤
│ VAE Encoder/Decoder     │ ae.sft            │ Image ↔ Latent conversion     │
│                         │ ~335MB            │ 8x compression ratio          │
├─────────────────────────┼───────────────────┼───────────────────────────────┤
│ CLIP Text Encoder       │ clip_l.safetensors│ Basic text understanding      │
│ (ViT-L/14)              │ ~250MB            │ Prompt → embedding            │
├─────────────────────────┼───────────────────┼───────────────────────────────┤
│ T5-XXL Text Encoder     │ t5xxl_fp8.sft     │ Deep semantic understanding   │
│ (FP8 quantized)         │ ~4.5GB            │ Rich prompt interpretation    │
├─────────────────────────┼───────────────────┼───────────────────────────────┤
│ Upscale Model           │ 4x-UltraSharp.pth │ Initial 4x resolution boost   │
│ (ESRGAN)                │ ~67MB             │ Before diffusion refinement   │
├─────────────────────────┼───────────────────┼───────────────────────────────┤
│ TOTAL VRAM REQUIRED     │                   │ ~12-15 GB                     │
└─────────────────────────┴───────────────────┴───────────────────────────────┘
```

---

## 3. FLUX Colab Pipeline (Original)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FLUX COLAB PIPELINE (Original)                         │
│                     (Cloud Processing ~15-30 min)                           │
└─────────────────────────────────────────────────────────────────────────────┘

                    IDENTICAL ARCHITECTURE TO LOCAL VERSION

                    Differences:
                    ┌────────────────────────────────────────────────────────┐
                    │  - Runs on Google Colab (T4/A100 GPU)                  │
                    │  - Uses aria2c for faster model downloads              │
                    │  - Supports file upload from local machine             │
                    │  - Default upscale_by = 2x (not 4x)                    │
                    │  - xformers enabled (Colab compatible)                 │
                    │  - Output to /content/ComfyUI/output/                  │
                    └────────────────────────────────────────────────────────┘
```

---

## Side-by-Side Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PIPELINE COMPARISON                                 │
└─────────────────────────────────────────────────────────────────────────────┘

REAL-ESRGAN STANDALONE          FLUX (Local & Colab)
========================        ====================================

Input Image                     Input Image
    │                               │
    ▼                               ▼
┌─────────────┐                 ┌─────────────┐
│ Load Model  │                 │ Text Encode │ ← CLIP + T5
│ (ESRGAN)    │                 │ (prompts)   │
└──────┬──────┘                 └──────┬──────┘
       │                               │
       │                               ▼
       │                        ┌─────────────┐
       │                        │ ESRGAN 4x   │ ← Same model!
       │                        │ (upscale)   │
       │                        └──────┬──────┘
       │                               │
       │                               ▼
       │                        ┌─────────────┐
       │                        │ VAE Encode  │ ← To latent space
       │                        │             │
       │                        └──────┬──────┘
       │                               │
       │                               ▼
       │                        ┌─────────────┐
       │                        │ FLUX DiT    │ ← Diffusion refinement
       │                        │ (20 steps)  │   (the slow part)
       │                        │ denoise=0.2 │
       │                        └──────┬──────┘
       │                               │
       │                               ▼
       │                        ┌─────────────┐
       │                        │ VAE Decode  │ ← Back to pixels
       │                        │             │
       │                        └──────┬──────┘
       │                               │
       ▼                               ▼
┌─────────────┐                 ┌─────────────┐
│ Tile Process│                 │ Tile Process│
│ + Blend     │                 │ + Blend     │
└──────┬──────┘                 └──────┬──────┘
       │                               │
       ▼                               ▼
   Output                           Output
   _esrgan.png                      _flux.png

TIME: ~30-60 sec                TIME: ~10-20 min
VRAM: ~2-4 GB                   VRAM: ~12-15 GB
```

---

## Quality Difference Explanation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHY FLUX PRODUCES BETTER QUALITY                          │
└─────────────────────────────────────────────────────────────────────────────┘

ESRGAN (Standalone):
┌─────────────────────────────────────────────────────────────────────────────┐
│  - Single forward pass through neural network                                │
│  - Can only interpolate/sharpen existing information                         │
│  - Limited by training data patterns                                         │
│  - Cannot "invent" new detail                                                │
│                                                                              │
│  Original pixel: [128, 128, 128]                                            │
│  ESRGAN output:  [125, 130, 127] ← Slightly adjusted based on neighbors     │
└─────────────────────────────────────────────────────────────────────────────┘

FLUX (Diffusion):
┌─────────────────────────────────────────────────────────────────────────────┐
│  - Iterative refinement (20 steps)                                          │
│  - Can generate new detail that "should be there"                            │
│  - Understands textures: fabric, skin, wood, metal, etc.                    │
│  - Guided by semantic understanding (T5 encoder)                            │
│                                                                              │
│  Original pixel: [128, 128, 128] (flat gray)                                │
│  FLUX output:    [145, 120, 135] ← Added texture detail based on context    │
│                                                                              │
│  denoise=0.2 means:                                                         │
│  - 80% of original structure preserved                                      │
│  - 20% regenerated/enhanced by AI                                           │
│  - Higher denoise = more AI creativity but less faithfulness                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFIGURATION DIFFERENCES                               │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│ Setting             │ Real-ESRGAN         │ FLUX                            │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ Scale Factor        │ Fixed 4x (model)    │ Configurable (upscale_by=4)     │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ Tile Size           │ 512 (configurable)  │ 512 (configurable)              │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ Denoise             │ N/A                 │ 0.2 (controls AI creativity)    │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ Steps               │ 1 (forward pass)    │ 20 (diffusion iterations)       │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ Prompts             │ Not supported       │ Optional (can guide style)      │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ Sampler             │ N/A                 │ euler, dpmpp_2m, etc.           │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ CFG Scale           │ N/A                 │ 7 (prompt adherence)            │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ FP16                │ Yes (faster)        │ Mixed (model dependent)         │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ LoRA Support        │ No                  │ Yes (style transfer)            │
└─────────────────────┴─────────────────────┴─────────────────────────────────┘
```

---

## Decision Flowchart

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHICH PIPELINE SHOULD I USE?                              │
└─────────────────────────────────────────────────────────────────────────────┘

                              START
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Is source image       │
                    │ already high quality? │
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                   YES                      NO
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │ Need it fast?     │   │ Use FLUX          │
        │ (preview/batch)   │   │ (better at fixing │
        └─────────┬─────────┘   │  soft/blurry)     │
                  │             └───────────────────┘
        ┌─────────┴─────────┐
        │                   │
       YES                  NO
        │                   │
        ▼                   ▼
┌───────────────┐   ┌───────────────┐
│ Real-ESRGAN   │   │ Want AI to    │
│ (~30-60 sec)  │   │ add detail?   │
└───────────────┘   └───────┬───────┘
                            │
                  ┌─────────┴─────────┐
                  │                   │
                 YES                  NO
                  │                   │
                  ▼                   ▼
          ┌───────────────┐   ┌───────────────┐
          │ Use FLUX      │   │ Real-ESRGAN   │
          │ (denoise 0.2+)│   │ (faithful)    │
          └───────────────┘   └───────────────┘
```

---

## Output File Naming

```
Input:  input/2WallartAbstract3.06-cropped.png

Real-ESRGAN Output:  4xoutput/2WallartAbstract3.06-cropped_esrgan.png
FLUX Output:         4xoutput/2WallartAbstract3.06-cropped_flux.png
```

---

## VRAM Usage Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VRAM USAGE OVER TIME                                  │
└─────────────────────────────────────────────────────────────────────────────┘

REAL-ESRGAN:
VRAM ▲
 4GB │    ████████████████████████████████
 2GB │    ████████████████████████████████
     └────────────────────────────────────► Time
          |←─── ~30-60 sec ───→|


FLUX:
VRAM ▲
15GB │              ████████████████████████████████████████
12GB │         █████████████████████████████████████████████
 8GB │    █████
 4GB │ ███                                                   ███
     └───────────────────────────────────────────────────────────► Time
         |←T5→|←─────── FLUX Diffusion (20 steps) ──────→|

     Legend: Loading models → Processing → Cleanup
```
