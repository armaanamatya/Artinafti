# Docker Container Plan for Image Upscaling Notebooks

## Context

You have three Jupyter notebooks implementing different AI upscaling approaches (FLUX, Real-ESRGAN, Imagen) that need to be containerized for production use. The goal is to:

1. **Package notebooks into a Docker container** with all dependencies and AI models pre-installed
2. **Expose REST API endpoints** using Python FastAPI to allow programmatic access to each upscaler
3. **Deploy on AWS with GPU support** (EC2 instances for FLUX/ESRGAN, cloud API for Imagen)
4. **Integrate with NestJS backend** that will serve as a proxy between frontend and Python API
5. **Share with supervisor** for testing with both local and cloud options

This transforms interactive notebooks into a production-ready service with clear API boundaries.

---

## Architecture Overview

```
┌─────────────┐     HTTP      ┌──────────────────────────────────────┐
│  Frontend   │ ────────────> │   NestJS Backend Container           │
│  (Web App)  │               │   (Port 3000)                        │
│             │ <──────────── │                                      │
└─────────────┘     JSON      │   ┌─────────────┐  ┌─────────────┐ │
                               │   │  NestJS API │  │ Bull Queue  │ │
                               │   │  Controllers│  │  + Redis    │ │
                               │   └──────┬──────┘  └──────┬──────┘ │
                               │          │                │         │
                               │          ▼                ▼         │
                               │   ┌─────────────────────────────┐  │
                               │   │  Python Child Processes     │  │
                               │   │  (FLUX, ESRGAN, Imagen)     │  │
                               │   │  + PyTorch/CUDA             │  │
                               │   └─────────────────────────────┘  │
                               │          │                          │
                               │   ┌──────▼──────┐   ┌─────────┐   │
                               │   │   Models    │   │ Results │   │
                               │   │  (Volume)   │   │ (Volume)│   │
                               │   └─────────────┘   └─────────┘   │
                               └──────────────────────────────────────┘
```

**Single Hybrid Container Setup:**
- **NestJS Backend**: Primary API server, handles all HTTP requests, file uploads, authentication
- **Bull Queue + Redis**: Manages async job processing (for long-running FLUX tasks)
- **Python Scripts**: Standalone ML processing scripts spawned as child processes
- **Shared GPU**: All Python processes access the same GPU via CUDA

---

## Implementation Plan

### Phase 1: Extract Upscaling Logic from Notebooks (2-3 days)

**Goal**: Convert notebook cells into reusable Python modules.

#### 1.1 Create Python Service Modules

Extract core logic from notebooks into standalone modules:

**`app/services/flux_upscaler.py`**
- Extract from: `resolution-upscaling/flux_upscaler_5060ti.ipynb`
- Key functions:
  - `load_flux_models()` - Load CLIP, T5, UNet (GGUF), VAE, upscale models
  - `upscale_single_image()` - Process single image with tiled upscaling
  - `calculate_scale_for_crop()` - Aspect-ratio-aware sizing
  - `clear_memory()` - GPU memory management
- Models to load (from `hf/models/`):
  - `unet/flux1-dev-Q8_0.gguf` (12GB)
  - `vae/ae.sft` (335MB)
  - `clip/clip_l.safetensors` (246MB)
  - `clip/t5xxl_fp8_e4m3fn.safetensors` (4.8GB)
  - `upscale_models/4x-UltraSharp.pth` (67MB)
  - `upscale_models/4x_foolhardy_Remacri.pth` (67MB)
  - `upscale_models/4x-AnimeSharp.pth` (67MB)

**`app/services/esrgan_upscaler.py`**
- Extract from: `resolution-upscaling/real_esrgan_upscaler.ipynb`
- Key functions:
  - `load_esrgan_model(model_name)` - Load via spandrel
  - `upscale_with_tiles()` - Tiled processing with blending
  - `upscale_and_resize()` - Main upscaling function
- Uses same upscale models as FLUX (4x-UltraSharp.pth, etc.)

**`app/services/imagen_upscaler.py`**
- Extract from: `resolution-upscaling/imagen_upscaler.ipynb`
- Key functions:
  - `get_credentials()` - Google Cloud authentication
  - `upscale_image_with_imagen()` - API call to Vertex AI
  - `encode_image_to_base64()` - Image encoding
  - `decode_base64_to_image()` - Response decoding

**`app/services/model_manager.py`**
- Singleton pattern for model caching
- Load models once at startup, reuse across requests
- Memory management and cleanup

#### 1.2 Create Utility Modules

**`app/utils/image_utils.py`**
- Image encoding/decoding (base64, PIL, tensor conversions)
- Format conversions (PNG, TIFF, JPEG)
- Aspect ratio calculations

**`python-scripts/utils/gpu_utils.py`**
- GPU availability checking
- Memory monitoring
- CUDA cleanup utilities

**`python-scripts/run_upscaler.py`**
- CLI entry point for NestJS to execute
- Parses command-line arguments
- Routes to appropriate upscaler (FLUX, ESRGAN, Imagen)
- Returns JSON output with result path
- Example usage: `python3 run_upscaler.py --method flux --config '{"image_path": "...", "upscale_factor": 4}'`

#### 1.3 Variable Dimension Handling

The Python scripts will automatically handle variable input dimensions:

**`python-scripts/utils/dimension_calculator.py`**
```python
def calculate_output_dimensions(
    input_width: int,
    input_height: int,
    upscale_factor: int = None,
    target_dpi: int = 150,
    target_width_inches: float = None,
    target_height_inches: float = None
) -> dict:
    """
    Calculate output dimensions based on input size and requirements.

    If target print size is NOT provided:
      - Output = input_size × upscale_factor

    If target print size IS provided:
      - Calculate required scale to achieve target_dpi at desired print size
      - Preserve aspect ratio with crop info

    Returns:
        {
            'output_width': int,
            'output_height': int,
            'scale_factor': float,
            'crop_info': {...}  # If aspect ratio adjustment needed
        }
    """
    if target_width_inches is None or target_height_inches is None:
        # Simple upscaling: output = input × scale_factor
        return {
            'output_width': input_width * upscale_factor,
            'output_height': input_height * upscale_factor,
            'scale_factor': upscale_factor,
            'crop_info': None
        }

    # Calculate dimensions for target print size
    target_width_px = int(target_width_inches * target_dpi)
    target_height_px = int(target_height_inches * target_dpi)

    input_aspect = input_width / input_height
    target_aspect = target_width_inches / target_height_inches

    # Calculate scale to achieve target (with aspect ratio handling)
    if abs(input_aspect - target_aspect) < 0.01:
        # Aspect ratios match - direct scale
        scale_factor = target_width_px / input_width
        return {
            'output_width': target_width_px,
            'output_height': target_height_px,
            'scale_factor': scale_factor,
            'crop_info': None
        }

    # Aspect ratio mismatch - scale to fit, provide crop guidance
    if input_aspect < target_aspect:
        # Input is taller - scale by width
        output_width = target_width_px
        scale_factor = output_width / input_width
        output_height = int(input_height * scale_factor)
        crop_px = output_height - target_height_px

        return {
            'output_width': output_width,
            'output_height': output_height,
            'scale_factor': scale_factor,
            'crop_info': {
                'direction': 'vertical',
                'amount_px': crop_px,
                'amount_inches': crop_px / target_dpi
            }
        }
    else:
        # Input is wider - scale by height
        output_height = target_height_px
        scale_factor = output_height / input_height
        output_width = int(input_width * scale_factor)
        crop_px = output_width - target_width_px

        return {
            'output_width': output_width,
            'output_height': output_height,
            'scale_factor': scale_factor,
            'crop_info': {
                'direction': 'horizontal',
                'amount_px': crop_px,
                'amount_inches': crop_px / target_dpi
            }
        }
```

This preserves the smart dimension handling from the notebooks while making it flexible for any input image.

---

### Phase 2: Build NestJS Application (3-4 days)

**Goal**: Create NestJS backend with REST API endpoints that spawn Python child processes.

#### 2.1 NestJS Application Structure

```
src/
├── main.ts                          # NestJS app bootstrap
├── app.module.ts                    # Root module with Bull, ServeStatic
├── config/
│   └── configuration.ts             # Environment configuration
├── upscaler/
│   ├── upscaler.module.ts           # Upscaler feature module
│   ├── upscaler.controller.ts       # API endpoints (POST /api/upscale/*)
│   ├── upscaler.service.ts          # Business logic
│   ├── processors/
│   │   ├── flux.processor.ts        # Bull queue processor for FLUX
│   │   ├── esrgan.processor.ts      # Bull queue processor for ESRGAN
│   │   └── imagen.processor.ts      # Bull queue processor for Imagen
│   ├── dto/
│   │   ├── flux-upscale.dto.ts      # Request validation schemas
│   │   ├── esrgan-upscale.dto.ts
│   │   └── imagen-upscale.dto.ts
│   └── interfaces/
│       └── upscale-job.interface.ts # TypeScript interfaces
├── python/
│   ├── python-executor.service.ts   # Service for spawning Python processes
│   └── python.module.ts             # Python executor module
├── health/
│   ├── health.controller.ts         # GET /api/health
│   └── health.module.ts
└── common/
    ├── filters/                     # Exception filters
    ├── interceptors/                # Response interceptors
    └── guards/                      # Auth guards (future)

python-scripts/                       # Python ML scripts (separate folder)
├── services/
│   ├── flux_upscaler.py             # Core FLUX logic
│   ├── esrgan_upscaler.py           # Core ESRGAN logic
│   └── imagen_upscaler.py           # Core Imagen logic
├── utils/
│   ├── image_utils.py               # Image processing utilities
│   └── gpu_utils.py                 # GPU utilities
└── run_upscaler.py                  # CLI entry point for NestJS to call
```

#### 2.2 API Endpoints

**POST /api/upscale/flux**
```typescript
// Request (multipart/form-data)
{
  file: File,                          // Input image file
  upscale_factor?: number,             // Scale multiplier (2, 4, etc.) - default 4
  target_dpi?: number,                 // Target DPI for print - default 150
  target_width_inches?: number,        // Optional: target print width in inches
  target_height_inches?: number,       // Optional: target print height in inches
  denoise?: number,                    // AI regeneration strength (0.0-1.0) - default 0.2
  steps?: number,                      // Diffusion steps - default 20
  tile_size?: number,                  // Tile size for processing - default 512
  upscale_model?: string,              // Model choice - default "4x-UltraSharp"
  output_format?: string               // "png" or "tiff" - default "png"
}

Response (Async):
{
  "jobId": "uuid",
  "status": "queued",
  "estimatedTime": 1200,               // seconds
  "inputSize": {
    "width": 1024,
    "height": 768
  },
  "outputSize": {
    "width": 4096,                     // Calculated based on input
    "height": 3072
  }
}
```

**POST /api/upscale/esrgan**
```typescript
// Request (multipart/form-data)
{
  file: File,                          // Input image file
  upscale_factor?: number,             // Scale multiplier (2, 4, etc.) - default 4
  target_dpi?: number,                 // Target DPI for print - default 150
  target_width_inches?: number,        // Optional: target print width in inches
  target_height_inches?: number,       // Optional: target print height in inches
  model?: string,                      // "4x-UltraSharp" | "4x_foolhardy_Remacri" | "4x-AnimeSharp"
  tile_size?: number,                  // Tile size - default 512
  use_fp16?: boolean,                  // Use FP16 precision - default true
  output_format?: string               // "png" or "tiff" - default "png"
}

Response (Fast, can be sync or async):
{
  "jobId": "uuid",
  "status": "completed",
  "outputUrl": "/api/results/uuid.png",
  "processingTime": 45.2,
  "inputSize": {
    "width": 1024,
    "height": 768
  },
  "outputSize": {
    "width": 4096,
    "height": 3072
  }
}
```

**POST /api/upscale/imagen**
```typescript
// Request (multipart/form-data)
{
  file: File,                          // Input image file
  upscale_factor?: string,             // "x2" | "x3" | "x4" - default "x4"
  target_dpi?: number,                 // Target DPI for print - default 150
  target_width_inches?: number,        // Optional: target print width in inches
  target_height_inches?: number,       // Optional: target print height in inches
  gcp_project_id?: string,             // GCP project - default from env
  gcp_region?: string                  // GCP region - default "us-central1"
}

Response (Cloud-based):
{
  "jobId": "uuid",
  "status": "completed",
  "outputUrl": "/api/results/uuid.png",
  "processingTime": 18.5,
  "inputSize": {
    "width": 1024,
    "height": 768
  },
  "outputSize": {
    "width": 4096,
    "height": 3072
  }
}
```

**Note on Variable Dimensions:**
- If `target_width_inches` and `target_height_inches` are NOT provided, the API automatically calculates output dimensions based on `upscale_factor` × input dimensions
- If target print size IS provided, the API calculates the optimal scale factor to achieve the desired print size at the specified DPI
- The notebooks' aspect-ratio-aware logic is preserved, ensuring proper scaling for print production

**GET /api/status/{task_id}**
```python
Response:
{
  "task_id": "uuid",
  "status": "processing" | "completed" | "failed",
  "progress": 45,  # 0-100
  "output_url": "/api/results/uuid.png",  # if completed
  "error": "error message"  # if failed
}
```

**GET /api/results/{filename}**
- Serve upscaled images from results volume

**GET /api/health**
```python
Response:
{
  "status": "healthy",
  "gpu_available": true,
  "gpu_name": "NVIDIA RTX 5060 Ti",
  "gpu_memory_free": 14.2,  # GB
  "models_loaded": ["flux", "esrgan"],
  "queue_size": 2
}
```

#### 2.3 Python Executor Service

Service for spawning Python child processes from NestJS:

**`src/python/python-executor.service.ts`**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';

@Injectable()
export class PythonExecutorService {
  private readonly logger = new Logger(PythonExecutorService.name);
  private readonly pythonPath = process.env.PYTHON_PATH || 'python3';
  private readonly scriptsPath = join(__dirname, '../../python-scripts');

  async executeUpscaler(
    method: 'flux' | 'esrgan' | 'imagen',
    config: any,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const scriptPath = join(this.scriptsPath, 'run_upscaler.py');
      const args = [
        scriptPath,
        '--method', method,
        '--config', JSON.stringify(config),
      ];

      this.logger.debug(`Executing Python: ${this.pythonPath} ${args.join(' ')}`);

      const pythonProcess = spawn(this.pythonPath, args, {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          CUDA_VISIBLE_DEVICES: '0',
        },
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        this.logger.debug(`Python stdout: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        this.logger.warn(`Python stderr: ${data}`);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result.output_path);
          } catch (err) {
            reject(new Error(`Failed to parse Python output: ${stdout}`));
          }
        } else {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    });
  }
}
```

#### 2.4 Bull Queue Processors

For async processing of long-running jobs:

**`src/upscaler/processors/flux.processor.ts`**
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PythonExecutorService } from '../../python/python-executor.service';

@Processor('upscaler')
export class FluxProcessor extends WorkerHost {
  private readonly logger = new Logger(FluxProcessor.name);

  constructor(private readonly pythonExecutor: PythonExecutorService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id}: ${job.name}`);

    try {
      switch (job.name) {
        case 'flux-upscale': {
          await job.updateProgress(10);

          const outputPath = await this.pythonExecutor.executeUpscaler(
            'flux',
            job.data,
          );

          await job.updateProgress(100);
          return { outputPath, status: 'completed' };
        }

        case 'esrgan-upscale': {
          await job.updateProgress(10);

          const outputPath = await this.pythonExecutor.executeUpscaler(
            'esrgan',
            job.data,
          );

          await job.updateProgress(100);
          return { outputPath, status: 'completed' };
        }

        case 'imagen-upscale': {
          await job.updateProgress(10);

          const outputPath = await this.pythonExecutor.executeUpscaler(
            'imagen',
            job.data,
          );

          await job.updateProgress(100);
          return { outputPath, status: 'completed' };
        }
      }
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`);
      throw error;
    }
  }
}
```

**Benefits:**
- Non-blocking API responses
- Progress tracking
- Job queue management with Bull/BullMQ
- Prevents GPU OOM from concurrent requests
- All logic centralized in NestJS

---

### Phase 3: Create Dockerfile with Pre-baked Models (3-4 days)

**Goal**: Build a ~50GB Docker image with CUDA support and all models pre-installed.

#### 3.1 Dockerfile

**Base Image**: `nvidia/cuda:12.8.0-cudnn9-runtime-ubuntu24.04`
- Matches RTX 5060 Ti CUDA 12.8 requirement
- Includes cuDNN 9 for PyTorch
- Also includes Node.js 20 for NestJS

**File**: `Dockerfile`

```dockerfile
# ========================================
# Stage 1: Model Downloader
# ========================================
FROM nvidia/cuda:12.8.0-cudnn9-runtime-ubuntu24.04 as model-downloader

WORKDIR /tmp/download

# Install Python and HuggingFace CLI
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir huggingface_hub

# Download all models to /models
RUN mkdir -p /models/unet /models/vae /models/clip /models/upscale_models

# Download FLUX models (~12GB)
RUN python3 -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('city96/FLUX.1-dev-gguf', 'flux1-dev-Q8_0.gguf', local_dir='/models/unet')"

RUN python3 -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('Isi99999/Upscalers', 'ae.sft', subfolder='Flux', local_dir='/models/vae')"

RUN python3 -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('Isi99999/Upscalers', 'clip_l.safetensors', subfolder='Flux', local_dir='/models/clip')"

RUN python3 -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('Isi99999/Upscalers', 't5xxl_fp8_e4m3fn.safetensors', subfolder='Flux', local_dir='/models/clip')"

# Download upscale models (~200MB)
RUN python3 -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('Isi99999/Upscalers', '4x-UltraSharp.pth', local_dir='/models/upscale_models')"

RUN python3 -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('Isi99999/Upscalers', '4x_foolhardy_Remacri.pth', local_dir='/models/upscale_models')"

RUN python3 -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('Isi99999/Upscalers', '4x-AnimeSharp.pth', local_dir='/models/upscale_models')"

# ========================================
# Stage 2: Node.js Builder
# ========================================
FROM node:20-slim as node-builder

WORKDIR /build

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build NestJS application
RUN npm run build

# ========================================
# Stage 3: Runtime
# ========================================
FROM nvidia/cuda:12.8.0-cudnn9-runtime-ubuntu24.04

WORKDIR /app

# Install Node.js 20, Python 3.11, and system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    libgl1 \
    libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get install -y python3.11 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy models from downloader stage
COPY --from=model-downloader /models /app/models

# Install PyTorch with CUDA 12.8 (nightly for RTX 5060 Ti)
RUN pip3 install --no-cache-dir --pre \
    torch torchvision \
    --index-url https://download.pytorch.org/whl/nightly/cu128

# Install Python dependencies
COPY python-requirements.txt .
RUN pip3 install --no-cache-dir -r python-requirements.txt

# Clone ComfyUI and custom nodes
RUN git clone https://github.com/Isi-dev/ComfyUI /app/hf/ComfyUI && \
    cd /app/hf/ComfyUI/custom_nodes && \
    git clone https://github.com/Isi-dev/ComfyUI_GGUF && \
    git clone https://github.com/Isi-dev/ComfyUI_UltimateSDUpscale && \
    pip3 install --no-cache-dir -r ComfyUI_GGUF/requirements.txt

# Copy NestJS built application from builder
COPY --from=node-builder /build/dist /app/dist
COPY --from=node-builder /build/node_modules /app/node_modules
COPY package*.json /app/

# Copy Python scripts
COPY python-scripts/ /app/python-scripts/

# Create directories
RUN mkdir -p /app/uploads /app/results /app/temp

# Environment variables
ENV MODEL_CACHE_DIR=/app/models
ENV OUTPUT_DIR=/app/results
ENV UPLOAD_DIR=/app/uploads
ENV PYTHONPATH=/app/hf/ComfyUI:$PYTHONPATH
ENV PYTHON_PATH=python3
ENV CUDA_VISIBLE_DEVICES=0
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Run NestJS application
CMD ["node", "dist/main"]
```

#### 3.2 Requirements Files

**File**: `package.json` (NestJS dependencies)

```json
{
  "name": "upscaler-api",
  "version": "1.0.0",
  "description": "NestJS Image Upscaler API with GPU support",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/config": "^3.1.1",
    "@nestjs/serve-static": "^4.0.0",
    "@nestjs/bullmq": "^10.0.1",
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.2",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1",
    "multer": "^1.4.5-lts.1",
    "uuid": "^9.0.1",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@types/express": "^4.17.17",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.7",
    "typescript": "^5.3.0",
    "ts-node": "^10.9.1"
  }
}
```

**File**: `python-requirements.txt` (Python ML dependencies)

```txt
# AI/ML frameworks
diffusers>=0.30.0
accelerate>=1.0.0
transformers>=4.28.1
einops>=0.8.0
safetensors>=0.4.0
sentencepiece>=0.2.0
spandrel>=0.5.0
gguf>=0.13.0
torchsde>=0.2.6

# Image processing
Pillow>=10.0.0
opencv-python>=4.8.0
imageio>=2.31.0
imageio-ffmpeg>=0.4.9

# HuggingFace
huggingface-hub>=0.20.0

# Google Cloud (for Imagen)
google-auth>=2.23.0
google-cloud-aiplatform>=1.38.0
```

#### 3.3 Docker Ignore File

**File**: `.dockerignore`

```
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
*.egg-info/

# Jupyter
*.ipynb_checkpoints/
*.ipynb

# Git
.git/
.gitignore
.github/

# Project specific
4xoutput/
input/
drive-download-*/
output/

# Documentation
*.md
compare.md
workflow.md
upscaling_research_report.md
imagenplan.md
imagenguide.md
initialresearch.md

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Secrets
*.env
*.env.*
*credentials*.json
*secret*.json

# Build artifacts
dist/
build/
```

---

### Phase 4: Docker Compose for Local Testing (1 day)

**Goal**: Enable local testing with GPU support.

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  # NestJS upscaler API (single container with Node.js + Python)
  upscaler-api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: upscaler-api
    ports:
      - "3000:3000"                    # NestJS API port
    volumes:
      - ./models:/app/models           # Persistent model cache
      - ./results:/app/results         # Output directory
      - ./uploads:/app/uploads         # Upload directory
    environment:
      - NODE_ENV=production
      - PORT=3000
      - CUDA_VISIBLE_DEVICES=0
      - MODEL_CACHE_DIR=/app/models
      - OUTPUT_DIR=/app/results
      - UPLOAD_DIR=/app/uploads
      - PYTHON_PATH=python3
      - PYTHONPATH=/app/hf/ComfyUI
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - MAX_CONCURRENT_JOBS=1          # Only 1 FLUX task at a time
      - GCP_PROJECT_ID=artinafti       # For Imagen
      - GCP_REGION=us-central1
      - DEFAULT_DPI=150                # Default DPI for print calculations
      - DEFAULT_UPSCALE_FACTOR=4       # Default scale factor
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 90s                # Longer startup for model loading

  # Redis for Bull queue
  redis:
    image: redis:7-alpine
    container_name: upscaler-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru

volumes:
  redis-data:
```

**Usage:**
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f upscaler-api

# Stop
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

---

### Phase 5: AWS Deployment Setup (2-3 days)

**Goal**: Deploy to AWS EC2 with GPU support.

#### 5.1 AWS Infrastructure

**Recommended Instance Types:**

| Upscaler | Instance Type | VRAM | vCPUs | Cost/hour (us-east-1) |
|----------|--------------|------|-------|----------------------|
| FLUX     | g5.2xlarge   | 24GB | 8     | $1.21                |
| ESRGAN   | g4dn.xlarge  | 16GB | 4     | $0.526               |
| Imagen   | t3.medium    | N/A  | 2     | $0.0416              |

**Choose**: `g5.2xlarge` for supporting all three upscalers

#### 5.2 EC2 Deployment Steps

**1. Launch EC2 Instance**
```bash
# Use AWS Deep Learning AMI (Ubuntu 24.04)
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type g5.2xlarge \
  --key-name your-key-pair \
  --security-groups upscaler-sg \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=200,VolumeType=gp3}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=upscaler-api}]'
```

**2. Security Group Configuration**
- Port 22 (SSH) - Your IP only
- Port 8000 (API) - Your IP or load balancer
- Port 6379 (Redis) - Internal only

**3. Connect and Setup**
```bash
# SSH into instance
ssh -i your-key.pem ubuntu@ec2-xx-xx-xx-xx.compute-amazonaws.com

# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo usermod -aG docker ubuntu

# Install nvidia-docker
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.repo | \
  sudo tee /etc/yum.repos.d/nvidia-docker.repo
sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker

# Verify GPU
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi

# Clone repository
git clone https://github.com/your-repo/upscaler-api.git
cd upscaler-api

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f
```

#### 5.3 Model Storage with EFS (Optional)

For persistent model storage across container restarts:

```yaml
# Add to docker-compose.yml
volumes:
  models:
    driver: local
    driver_opts:
      type: nfs
      o: addr=fs-xxxxx.efs.us-east-1.amazonaws.com,nfsvers=4.1
      device: ":/models"
```

#### 5.4 Auto-Scaling Configuration

**Scale down during off-hours to save costs:**

```bash
# Stop instance at 11 PM
aws autoscaling put-scheduled-action \
  --scheduled-action-name scale-down-night \
  --auto-scaling-group-name upscaler-asg \
  --recurrence "0 23 * * *" \
  --desired-capacity 0

# Start instance at 6 AM
aws autoscaling put-scheduled-action \
  --scheduled-action-name scale-up-morning \
  --auto-scaling-group-name upscaler-asg \
  --recurrence "0 6 * * *" \
  --desired-capacity 1
```

---

### Phase 6: Complete NestJS Implementation (Already Done in Phase 2)

Since NestJS is now the primary backend (see Phase 2), this phase focuses on additional controller implementations.

#### 6.1 Complete Controller Implementation

**File**: `src/upscaler/upscaler.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  Res,
  HttpStatus,
  ParseFilePipe,
  FileTypeValidator,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpscalerService } from './upscaler.service';
import { FluxUpscaleDto, EsrganUpscaleDto, ImagenUpscaleDto } from './dto';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

@Controller('api/upscale')
export class UpscalerController {
  constructor(private readonly upscalerService: UpscalerService) {}

  @Post('flux')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads',
        filename: (req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async upscaleFlux(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: '.(png|jpg|jpeg|webp)' }),
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }), // 50MB
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: FluxUpscaleDto,
  ) {
    return await this.upscalerService.queueUpscale('flux', file.path, dto);
  }

  @Post('esrgan')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads',
        filename: (req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async upscaleEsrgan(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: '.(png|jpg|jpeg|webp)' }),
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: EsrganUpscaleDto,
  ) {
    return await this.upscalerService.queueUpscale('esrgan', file.path, dto);
  }

  @Post('imagen')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads',
        filename: (req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async upscaleImagen(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: '.(png|jpg|jpeg|webp)' }),
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: ImagenUpscaleDto,
  ) {
    return await this.upscalerService.queueUpscale('imagen', file.path, dto);
  }

  @Get('status/:jobId')
  async getStatus(@Param('jobId') jobId: string) {
    return await this.upscalerService.getJobStatus(jobId);
  }

  @Get('result/:filename')
  async downloadResult(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const filePath = await this.upscalerService.getResultPath(filename);
    res.sendFile(filePath);
  }
}
```

#### 6.2 Environment Configuration

**File**: `.env`

```env
# Server
NODE_ENV=production
PORT=3000

# Paths
UPLOAD_DIR=/app/uploads
OUTPUT_DIR=/app/results
MODEL_CACHE_DIR=/app/models

# Python
PYTHON_PATH=python3
PYTHONPATH=/app/hf/ComfyUI

# Redis/Bull
REDIS_HOST=redis
REDIS_PORT=6379

# GPU
CUDA_VISIBLE_DEVICES=0

# Upscaling defaults
DEFAULT_DPI=150
DEFAULT_UPSCALE_FACTOR=4
MAX_CONCURRENT_JOBS=1

# Google Cloud (for Imagen)
GCP_PROJECT_ID=artinafti
GCP_REGION=us-central1
```

---

### Phase 7: Supervisor Testing Setup (1 day)

**Goal**: Make it easy for supervisor to test locally or on cloud.

#### 7.1 Local Testing Package

**Create**: `supervisor-test-package.zip`

**Contents:**
```
supervisor-test-package/
├── README.md                    # Setup instructions
├── docker-compose.yml           # Full stack
├── .env.example                 # Configuration template
├── test-images/                 # Sample images
│   ├── sample1.jpg
│   └── sample2.jpg
└── test-api.sh                  # Test script
```

**File**: `supervisor-test-package/README.md`

```markdown
# Upscaler API - Testing Guide

## Prerequisites

1. **Docker Desktop with GPU support** (for local testing)
   - Windows: Docker Desktop 4.25+ with WSL2 GPU support
   - Linux: Docker + nvidia-docker2

2. **NVIDIA GPU** with 16GB+ VRAM (RTX 3090, RTX 4090, RTX 5060 Ti, etc.)

## Quick Start (Local Testing)

1. **Extract package**
   ```bash
   unzip supervisor-test-package.zip
   cd supervisor-test-package
   ```

2. **Copy environment file**
   ```bash
   cp .env.example .env
   # Edit .env if needed
   ```

3. **Start services**
   ```bash
   docker-compose up -d
   ```

   First startup takes 2-3 minutes to load models into GPU memory.

4. **Test the API**
   ```bash
   # Check health
   curl http://localhost:8000/api/health

   # Test ESRGAN upscale (fast - 30-60 seconds)
   curl -X POST http://localhost:8000/api/upscale/esrgan \
     -F "image=@test-images/sample1.jpg" \
     -F "target_width=3000" \
     -F "target_height=1500" \
     -F "model=4x-UltraSharp"
   ```

5. **Access Swagger UI**

   Open browser: http://localhost:8000/docs

6. **View logs**
   ```bash
   docker-compose logs -f upscaler-api
   ```

## API Endpoints

- **ESRGAN** (Fast, 30-60s): `POST /api/upscale/esrgan`
- **FLUX** (High Quality, 10-40min): `POST /api/upscale/flux`
- **Imagen** (Cloud, 15-20s): `POST /api/upscale/imagen`
- **Status**: `GET /api/status/{task_id}`
- **Health**: `GET /api/health`

## Stopping Services

```bash
docker-compose down
```
```

**File**: `supervisor-test-package/test-api.sh`

```bash
#!/bin/bash

echo "Testing Upscaler API..."

# Health check
echo "1. Health Check"
curl -s http://localhost:8000/api/health | jq

# ESRGAN upscale test
echo -e "\n2. ESRGAN Upscale Test"
RESPONSE=$(curl -s -X POST http://localhost:8000/api/upscale/esrgan \
  -F "image=@test-images/sample1.jpg" \
  -F "target_width=2000" \
  -F "target_height=1000" \
  -F "model=4x-UltraSharp")

echo $RESPONSE | jq

TASK_ID=$(echo $RESPONSE | jq -r '.task_id')

# Poll status
echo -e "\n3. Checking Status"
while true; do
  STATUS=$(curl -s http://localhost:8000/api/status/$TASK_ID | jq -r '.status')
  echo "Status: $STATUS"

  if [ "$STATUS" == "completed" ]; then
    echo "✓ Upscale completed!"
    break
  elif [ "$STATUS" == "failed" ]; then
    echo "✗ Upscale failed!"
    exit 1
  fi

  sleep 5
done

echo -e "\n✓ All tests passed!"
```

#### 7.2 AWS Cloud Testing (If no local GPU)

**Temporary deployment** for supervisor testing:

1. Deploy to AWS EC2 (see Phase 5)
2. Share public IP: `http://ec2-xx-xx-xx-xx.compute-amazonaws.com:8000`
3. Provide Swagger UI link: `http://ec2-xx-xx-xx-xx.compute-amazonaws.com:8000/docs`
4. Include Postman collection for easy testing

---

## Critical Files Reference

### Files to Extract Logic From:

1. **`C:\Users\Armaan\Desktop\Artinafti\resolution-upscaling\flux_upscaler_5060ti.ipynb`**
   - Cells 3-5: FLUX upscaling logic, model loading, tiled processing
   - Use for: `app/services/flux_upscaler.py`

2. **`C:\Users\Armaan\Desktop\Artinafti\resolution-upscaling\real_esrgan_upscaler.ipynb`**
   - Cells 3-6: ESRGAN upscaling logic, spandrel model loading
   - Use for: `app/services/esrgan_upscaler.py`

3. **`C:\Users\Armaan\Desktop\Artinafti\resolution-upscaling\imagen_upscaler.ipynb`**
   - Cells 2-4: Imagen API calls, authentication, base64 encoding
   - Use for: `app/services/imagen_upscaler.py`

4. **`C:\Users\Armaan\Desktop\Artinafti\requirements.txt`**
   - Use as base for Docker requirements.txt
   - Add FastAPI, Celery, Redis packages

5. **`C:\Users\Armaan\Desktop\Artinafti\.gitignore`**
   - Reference for .dockerignore patterns

---

## Implementation Timeline

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| 1 | Extract upscaling logic from notebooks | 2-3 days | - |
| 2 | Build FastAPI application | 2-3 days | Phase 1 |
| 3 | Create Dockerfile (first build takes 1-2 hours) | 3-4 days | Phase 2 |
| 4 | Docker Compose for local testing | 1 day | Phase 3 |
| 5 | AWS deployment setup | 2-3 days | Phase 4 |
| 6 | NestJS backend integration | 2 days | Phase 5 |
| 7 | Supervisor testing package | 1 day | Phase 6 |

**Total Estimated Time**: 13-18 days

---

## Verification Steps

### Local Verification

1. **Build Docker image**
   ```bash
   docker build -t upscaler-api:latest .
   ```
   Expected: ~50GB image, build takes 60-90 minutes

2. **Start services**
   ```bash
   docker-compose up -d
   ```

3. **Test ESRGAN endpoint (fast)**
   ```bash
   curl -X POST http://localhost:8000/api/upscale/esrgan \
     -F "image=@input/test.jpg" \
     -F "target_width=2000" \
     -F "target_height=1000"
   ```
   Expected: Response in 30-60 seconds

4. **Test FLUX endpoint (slow)**
   ```bash
   curl -X POST http://localhost:8000/api/upscale/flux \
     -F "image=@input/test.jpg" \
     -F "target_width=3000" \
     -F "target_height=1500"
   ```
   Expected: Async response with task_id, completion in 10-40 minutes

5. **Test Imagen endpoint (cloud)**
   ```bash
   curl -X POST http://localhost:8000/api/upscale/imagen \
     -F "image=@input/test.jpg" \
     -F "target_width=2000" \
     -F "target_height=1000" \
     -F "gcp_project_id=artinafti"
   ```
   Expected: Response in 15-20 seconds (requires Google Cloud credentials)

6. **Check Swagger UI**

   Open: http://localhost:8000/docs

   Test all endpoints interactively

### AWS Verification

1. **Deploy to EC2**

   Follow Phase 5 steps

2. **Test remote API**
   ```bash
   curl http://ec2-xx-xx-xx-xx.compute-amazonaws.com:8000/api/health
   ```

3. **Load test**

   Submit multiple ESRGAN requests, verify queue management

4. **Monitor GPU usage**
   ```bash
   ssh into EC2
   watch -n 1 nvidia-smi
   ```

### NestJS Integration Verification

1. **Start NestJS backend**
   ```bash
   npm run start:dev
   ```

2. **Test upscale endpoint**
   ```bash
   curl -X POST http://localhost:3000/api/upscaler/esrgan \
     -H "Content-Type: application/json" \
     -d '{"imagePath": "/path/to/image.jpg", "config": {...}}'
   ```

3. **Verify file download**

   Upload → Process → Download workflow

---

## Notes

- **Docker image size**: ~50GB (models pre-baked)
- **First startup**: 30-60 seconds to load models into GPU
- **GPU memory**: 16GB required for FLUX, 8GB for ESRGAN
- **FLUX processing**: 10-40 minutes per image (async with Celery)
- **ESRGAN processing**: 10-100 seconds per image
- **Imagen processing**: 15-20 seconds per image (cloud API)
- **Concurrent requests**: Limited to 1 FLUX task at a time (GPU memory)
- **Model updates**: Rebuild Docker image or use volume mounts

---

## Cost Estimates (AWS)

- **g5.2xlarge**: $1.21/hour (~$870/month if running 24/7)
- **Spot instance**: ~$0.40/hour (70% savings, may be interrupted)
- **EFS storage**: $0.08/GB-month for model cache (~$4/month for 50GB)
- **Data transfer**: $0.09/GB after first 100GB

**Recommended**: Use scheduled scaling to shut down during off-hours (nights/weekends)

---

## Next Steps After Implementation

1. **Add authentication** (API keys, JWT)
2. **Add rate limiting** (prevent abuse)
3. **Set up monitoring** (Prometheus, Grafana)
4. **Configure CloudWatch alerts** (GPU utilization, API errors)
5. **Implement webhooks** (notify when processing completes)
6. **Add S3 integration** (store results in S3 instead of local disk)
7. **Create admin dashboard** (view queue, cancel jobs, monitor costs)
