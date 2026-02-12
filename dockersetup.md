# Docker Container Plan for Image Upscaling Notebooks

## Context

You have three Jupyter notebooks implementing different AI upscaling approaches (FLUX, Real-ESRGAN, Imagen) that need to be containerized for production use. The goal is to:

1. **Package notebooks into a Docker container** with all dependencies and AI models pre-installed
2. **Expose REST API endpoints** using NestJS + Python worker to allow programmatic access to each upscaler
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

#### 2.3 Python Worker Service (Persistent Process)

Instead of spawning a new Python process per request (which would reload 12GB+ of models each time), we use a **persistent Python worker** that loads models once at startup and accepts jobs via stdin/stdout JSON-line protocol.

**`python-scripts/worker.py`** (Long-running Python process)
```python
import sys
import json
import traceback
from services.flux_upscaler import FluxUpscaler
from services.esrgan_upscaler import EsrganUpscaler
from services.imagen_upscaler import ImagenUpscaler

# Load models ONCE at startup
print(json.dumps({"type": "status", "message": "loading_models"}), flush=True)
flux = FluxUpscaler()
esrgan = EsrganUpscaler()
imagen = ImagenUpscaler()
print(json.dumps({"type": "status", "message": "ready"}), flush=True)

# Process jobs from stdin (one JSON per line)
for line in sys.stdin:
    try:
        job = json.loads(line.strip())
        method = job["method"]
        config = job["config"]
        job_id = job["job_id"]

        if method == "flux":
            result = flux.upscale(config)
        elif method == "esrgan":
            result = esrgan.upscale(config)
        elif method == "imagen":
            result = imagen.upscale(config)
        else:
            raise ValueError(f"Unknown method: {method}")

        print(json.dumps({
            "type": "result",
            "job_id": job_id,
            "output_path": result["output_path"],
            "status": "completed"
        }), flush=True)

    except Exception as e:
        print(json.dumps({
            "type": "error",
            "job_id": job.get("job_id", "unknown"),
            "error": str(e),
            "traceback": traceback.format_exc()
        }), flush=True)
```

**`src/python/python-executor.service.ts`** (NestJS side - manages persistent worker)
```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { createInterface, Interface } from 'readline';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PythonExecutorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PythonExecutorService.name);
  private pythonProcess: ChildProcess;
  private readline: Interface;
  private pendingJobs = new Map<string, { resolve: Function; reject: Function }>();
  private isReady = false;

  async onModuleInit() {
    await this.startWorker();
  }

  onModuleDestroy() {
    this.pythonProcess?.kill();
  }

  private startWorker(): Promise<void> {
    return new Promise((resolve) => {
      const workerPath = join(__dirname, '../../python-scripts/worker.py');

      this.pythonProcess = spawn(
        process.env.PYTHON_PATH || 'python3',
        ['-u', workerPath],
        {
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            CUDA_VISIBLE_DEVICES: '0',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      this.readline = createInterface({ input: this.pythonProcess.stdout });

      this.readline.on('line', (line) => {
        try {
          const msg = JSON.parse(line);

          if (msg.type === 'status' && msg.message === 'ready') {
            this.isReady = true;
            this.logger.log('Python worker ready - models loaded');
            resolve();
            return;
          }

          if (msg.type === 'result' || msg.type === 'error') {
            const pending = this.pendingJobs.get(msg.job_id);
            if (pending) {
              this.pendingJobs.delete(msg.job_id);
              if (msg.type === 'result') {
                pending.resolve(msg.output_path);
              } else {
                pending.reject(new Error(msg.error));
              }
            }
          }
        } catch (err) {
          this.logger.warn(`Non-JSON from Python: ${line}`);
        }
      });

      this.pythonProcess.stderr.on('data', (data) => {
        this.logger.warn(`Python stderr: ${data}`);
      });

      this.pythonProcess.on('exit', (code) => {
        this.logger.error(`Python worker exited with code ${code}`);
        this.isReady = false;
        // Auto-restart after 5 seconds
        setTimeout(() => this.startWorker(), 5000);
      });
    });
  }

  async executeUpscaler(
    method: 'flux' | 'esrgan' | 'imagen',
    config: any,
  ): Promise<string> {
    if (!this.isReady) {
      throw new Error('Python worker not ready - models still loading');
    }

    const jobId = uuidv4();

    return new Promise((resolve, reject) => {
      this.pendingJobs.set(jobId, { resolve, reject });

      const job = JSON.stringify({
        job_id: jobId,
        method,
        config,
      });

      this.pythonProcess.stdin.write(job + '\n');
    });
  }
}
```

**Key benefits over spawn-per-request:**
- Models loaded once at startup (~30-60s), reused for all requests
- FLUX (12GB) and ESRGAN models stay in GPU memory
- Auto-restarts if the worker crashes
- NestJS tracks pending jobs by ID

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

### Phase 3: Create Dockerfile (3-4 days)

**Goal**: Build Docker image with CUDA support. Two modes:
- **Production**: Models pre-baked into image (~50GB) — no downloads at startup
- **Development**: Models mounted via volume (~5GB image) — fast rebuilds, models stored on host

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

#### 3.2 Development Dockerfile (Volume-Mounted Models)

For development, skip the model download stage entirely. Models are mounted from the host machine at runtime.

**File**: `Dockerfile.dev`

```dockerfile
# ========================================
# Stage 1: Node.js Builder
# ========================================
FROM node:20-slim as node-builder

WORKDIR /build
COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

# ========================================
# Stage 2: Runtime (NO models baked in)
# ========================================
FROM nvidia/cuda:12.8.0-cudnn9-runtime-ubuntu24.04

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl git libgl1 libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs python3.11 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# NOTE: No COPY --from=model-downloader — models come from volume mount

RUN pip3 install --no-cache-dir --pre \
    torch torchvision \
    --index-url https://download.pytorch.org/whl/nightly/cu128

COPY python-requirements.txt .
RUN pip3 install --no-cache-dir -r python-requirements.txt

RUN git clone https://github.com/Isi-dev/ComfyUI /app/hf/ComfyUI && \
    cd /app/hf/ComfyUI/custom_nodes && \
    git clone https://github.com/Isi-dev/ComfyUI_GGUF && \
    git clone https://github.com/Isi-dev/ComfyUI_UltimateSDUpscale && \
    pip3 install --no-cache-dir -r ComfyUI_GGUF/requirements.txt

COPY --from=node-builder /build/dist /app/dist
COPY --from=node-builder /build/node_modules /app/node_modules
COPY package*.json /app/
COPY python-scripts/ /app/python-scripts/

RUN mkdir -p /app/uploads /app/results /app/temp

ENV MODEL_CACHE_DIR=/app/models
ENV PYTHONPATH=/app/hf/ComfyUI:$PYTHONPATH
ENV PYTHON_PATH=python3

EXPOSE 3000
CMD ["node", "dist/main"]
```

**File**: `docker-compose.dev.yml`

```yaml
version: '3.8'

services:
  upscaler-api:
    build:
      context: .
      dockerfile: Dockerfile.dev          # Uses dev Dockerfile (no models baked in)
    container_name: upscaler-api-dev
    ports:
      - "3000:3000"
    volumes:
      - ./hf/models:/app/models           # Mount local models directory
      - ./results:/app/results
      - ./uploads:/app/uploads
      - ./python-scripts:/app/python-scripts  # Live-reload Python scripts
    environment:
      - NODE_ENV=development
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - MODEL_CACHE_DIR=/app/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

**Usage:**
```bash
# Dev mode (uses local models from ./hf/models)
docker-compose -f docker-compose.dev.yml up -d

# Production mode (models pre-baked)
docker-compose up -d
```

Image size comparison:
- **Production** (`Dockerfile`): ~50GB (models included)
- **Development** (`Dockerfile.dev`): ~5GB (models on host via volume)

#### 3.3 Requirements Files

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

#### 3.4 Docker Ignore File

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

### Phase 5: VPS / Cloud Deployment Setup (2-3 days)

**Goal**: Deploy to a GPU VPS that exposes a REST API your NestJS backend can call.

#### 5.1 GPU VPS Provider Comparison

| Provider | GPU | VRAM | Cost/hour | Cost/month (24/7) | API for launch/terminate |
|----------|-----|------|-----------|-------------------|--------------------------|
| **Lambda Cloud** | 1x A10 | 24GB | $0.60 | ~$432 | Yes (REST API) |
| **Lambda Cloud** | 1x A100 | 40GB | $1.10 | ~$792 | Yes (REST API) |
| AWS EC2 | g5.2xlarge | 24GB | $1.21 | ~$870 | Yes (AWS API) |
| AWS EC2 | g4dn.xlarge | 16GB | $0.526 | ~$378 | Yes (AWS API) |
| RunPod | A10 | 24GB | $0.44 | ~$317 | Yes (REST API) |
| Vast.ai | A10 | 24GB | ~$0.30 | ~$216 | Yes (REST API) |

**Recommended**: Lambda Cloud `gpu_1x_a10` (24GB, $0.60/hr) — good balance of price, reliability, and API support. 24GB VRAM handles FLUX + ESRGAN simultaneously.

#### 5.2 Lambda Cloud Deployment (Primary Option)

**Lambda Cloud API** — Base URL: `https://cloud.lambdalabs.com/api/v1`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/instance-types` | GET | List available GPU types |
| `/instances` | GET | List running instances |
| `/instances/{id}` | GET | Get specific instance |
| `/instance-operations/launch` | POST | Launch new instance |
| `/instance-operations/terminate` | POST | Terminate instance |
| `/instance-operations/restart` | POST | Restart instance |
| `/ssh-keys` | GET/POST/DELETE | Manage SSH keys |

**Authentication**: Bearer token via `Authorization: Bearer <LAMBDA_API_KEY>`

**1. Launch Config**

```json
{
  "region_name": "us-west-1",
  "instance_type_name": "gpu_1x_a10",
  "ssh_key_names": ["your-ssh-key"],
  "file_system_names": [],
  "quantity": 1
}
```

**2. Launch Instance**
```bash
# Set API key
export LAMBDA_API_KEY="your-api-key"

# Launch GPU instance
curl -X POST https://cloud.lambdalabs.com/api/v1/instance-operations/launch \
  -H "Authorization: Bearer $LAMBDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "region_name": "us-west-1",
    "instance_type_name": "gpu_1x_a10",
    "ssh_key_names": ["your-ssh-key"],
    "quantity": 1
  }'

# Check instance status
curl https://cloud.lambdalabs.com/api/v1/instances \
  -H "Authorization: Bearer $LAMBDA_API_KEY"
```

**3. Setup Instance (SSH)**
```bash
# SSH into Lambda instance
ssh ubuntu@<instance-ip>

# Docker and nvidia-docker are pre-installed on Lambda Cloud
# Verify GPU
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi

# Clone repository
git clone https://github.com/your-repo/upscaler-api.git
cd upscaler-api

# Start services
docker-compose up -d

# Check health
curl http://localhost:3000/api/health
```

**4. Terminate When Not Needed**
```bash
curl -X POST https://cloud.lambdalabs.com/api/v1/instance-operations/terminate \
  -H "Authorization: Bearer $LAMBDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instance_ids": ["<instance-id>"]}'
```

#### 5.3 Networking: How Your NestJS Backend Reaches the GPU VPS

Your NestJS backend needs to call the upscaler API running on the GPU VPS. Two approaches:

**Option A: Tailscale (Recommended for security)**

Tailscale creates a private mesh VPN. Your GPU VPS and NestJS backend join the same Tailscale network and communicate over private IPs — no public ports exposed.

```bash
# On GPU VPS (Lambda/AWS/RunPod):
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-auth-xxxxx

# The GPU VPS gets a Tailscale IP like 100.x.x.x
# Your NestJS backend calls: http://100.x.x.x:3000/api/upscale/esrgan
```

In your NestJS backend:
```typescript
// .env
UPSCALER_API_URL=http://100.x.x.x:3000  // Tailscale private IP

// upscaler-proxy.service.ts
const response = await fetch(`${process.env.UPSCALER_API_URL}/api/upscale/esrgan`, {
  method: 'POST',
  body: formData,
});
```

**Benefits:**
- No public ports exposed on GPU VPS
- Works across any VPS provider (Lambda, AWS, RunPod)
- Encrypted end-to-end
- Survives IP changes (Tailscale uses stable IDs)

**Option B: Public IP with API Key Auth**

Expose port 3000 publicly and protect with an API key header.

```bash
# GPU VPS firewall
ufw allow 3000/tcp
```

```typescript
// On the GPU VPS — add API key guard to NestJS
@UseGuards(ApiKeyGuard)
@Controller('api/upscale')
export class UpscalerController { ... }
```

```typescript
// From your main NestJS backend
const response = await fetch(`http://<gpu-vps-public-ip>:3000/api/upscale/esrgan`, {
  method: 'POST',
  headers: { 'X-API-Key': process.env.UPSCALER_API_KEY },
  body: formData,
});
```

#### 5.4 AWS EC2 Alternative

If you prefer AWS:

```bash
# Launch EC2 g5.2xlarge with Deep Learning AMI
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type g5.2xlarge \
  --key-name your-key-pair \
  --security-groups upscaler-sg \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=200,VolumeType=gp3}'

# Security Group: SSH (22) + API (3000) from your IP only
# Then SSH in, clone repo, docker-compose up -d
```

#### 5.5 Programmatic Instance Management (Optional)

Use the Lambda Cloud API from your NestJS backend to auto-launch/terminate GPU instances on demand:

```bash
# Install Lambda Cloud Manager CLI
pip install git+https://github.com/joehoover/lambda-cloud-manager.git

# List available GPUs
lcm get-instance-types

# Launch from config
lcm launch ./configs/a10.json --name upscaler-prod

# Terminate
lcm terminate --name upscaler-prod
```

This lets you build a "spin up on first request, spin down after idle" pattern to save costs.

---

### Phase 6: NestJS Controller Details (Reference for Phase 2)

> **Note**: This phase is merged into Phase 2. The controller code below is part of the NestJS application built in Phase 2.

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
   curl http://localhost:3000/api/health

   # Test ESRGAN upscale (fast - 30-60 seconds)
   curl -X POST http://localhost:3000/api/upscale/esrgan \
     -F "image=@test-images/sample1.jpg" \
     -F "target_width=3000" \
     -F "target_height=1500" \
     -F "model=4x-UltraSharp"
   ```

5. **Access Swagger UI**

   Open browser: http://localhost:3000/docs

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
curl -s http://localhost:3000/api/health | jq

# ESRGAN upscale test
echo -e "\n2. ESRGAN Upscale Test"
RESPONSE=$(curl -s -X POST http://localhost:3000/api/upscale/esrgan \
  -F "image=@test-images/sample1.jpg" \
  -F "target_width=2000" \
  -F "target_height=1000" \
  -F "model=4x-UltraSharp")

echo $RESPONSE | jq

TASK_ID=$(echo $RESPONSE | jq -r '.task_id')

# Poll status
echo -e "\n3. Checking Status"
while true; do
  STATUS=$(curl -s http://localhost:3000/api/status/$TASK_ID | jq -r '.status')
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

#### 7.2 Cloud Testing (If no local GPU)

**Temporary deployment** for supervisor testing:

1. Launch Lambda Cloud A10 instance (see Phase 5.2)
2. Deploy with `docker-compose up -d`
3. Share access via Tailscale invite or public IP: `http://<instance-ip>:3000`
4. Include Postman collection for easy testing
5. Terminate instance after testing to avoid charges

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
   - Add BullMQ, Redis packages (NestJS side)

5. **`C:\Users\Armaan\Desktop\Artinafti\.gitignore`**
   - Reference for .dockerignore patterns

---

## Implementation Timeline

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| 1 | Extract upscaling logic from notebooks | 2-3 days | - |
| 2 | Build NestJS application + Python scripts | 3-4 days | Phase 1 |
| 3 | Create Dockerfile (first build takes 1-2 hours) | 3-4 days | Phase 2 |
| 4 | Docker Compose for local testing | 1 day | Phase 3 |
| 5 | VPS/Cloud deployment setup | 2-3 days | Phase 4 |
| 6 | *(Merged into Phase 2)* | 0 days | - |
| 7 | Supervisor testing package | 1 day | Phase 5 |

**Total Estimated Time**: 11-15 days

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
   curl -X POST http://localhost:3000/api/upscale/esrgan \
     -F "image=@input/test.jpg" \
     -F "target_width=2000" \
     -F "target_height=1000"
   ```
   Expected: Response in 30-60 seconds

4. **Test FLUX endpoint (slow)**
   ```bash
   curl -X POST http://localhost:3000/api/upscale/flux \
     -F "image=@input/test.jpg" \
     -F "target_width=3000" \
     -F "target_height=1500"
   ```
   Expected: Async response with task_id, completion in 10-40 minutes

5. **Test Imagen endpoint (cloud)**
   ```bash
   curl -X POST http://localhost:3000/api/upscale/imagen \
     -F "image=@input/test.jpg" \
     -F "target_width=2000" \
     -F "target_height=1000" \
     -F "gcp_project_id=artinafti"
   ```
   Expected: Response in 15-20 seconds (requires Google Cloud credentials)

6. **Check Swagger UI**

   Open: http://localhost:3000/docs

   Test all endpoints interactively

### AWS Verification

1. **Deploy to EC2**

   Follow Phase 5 steps

2. **Test remote API**
   ```bash
   curl http://ec2-xx-xx-xx-xx.compute-amazonaws.com:3000/api/health
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

- **Docker image size**: ~50GB production (models pre-baked), ~5GB dev (volume-mounted models)
- **First startup**: 30-60 seconds for persistent Python worker to load models into GPU
- **GPU memory**: 16GB required for FLUX, 8GB for ESRGAN
- **FLUX processing**: 10-40 minutes per image (async with Bull queue)
- **ESRGAN processing**: 10-100 seconds per image
- **Imagen processing**: 15-20 seconds per image (cloud API)
- **Concurrent requests**: Limited to 1 FLUX task at a time (GPU memory)
- **Model updates**: Rebuild Docker image (prod) or update host files (dev)
- **Networking**: Tailscale for private VPN, or public IP with API key auth

---

## Cost Estimates

| Provider | GPU | Cost/hour | Cost/month (24/7) | Notes |
|----------|-----|-----------|-------------------|-------|
| Lambda Cloud | 1x A10 (24GB) | $0.60 | ~$432 | Pre-installed Docker + NVIDIA |
| RunPod | A10 (24GB) | $0.44 | ~$317 | Cheapest reliable option |
| Vast.ai | A10 (24GB) | ~$0.30 | ~$216 | Community GPUs, less reliable |
| AWS EC2 | g5.2xlarge (24GB) | $1.21 | ~$870 | Most enterprise features |
| AWS Spot | g5.2xlarge | ~$0.40 | ~$288 | 70% savings, may interrupt |

**Recommended for always-on**: Lambda Cloud A10 at $432/month
**Recommended for budget**: Use Lambda Cloud API to launch on demand, terminate when idle

---

## Next Steps After Implementation

1. **Add API key authentication** (protect upscaler endpoints)
2. **Add rate limiting** (prevent abuse)
3. **Set up Tailscale** for secure networking between backend and GPU VPS
4. **Implement webhooks** (notify when processing completes)
5. **Add S3/cloud storage** (store results instead of local disk)
6. **Auto-scaling** (use Lambda/RunPod API to launch/terminate on demand)
7. **Monitoring** (GPU utilization, queue depth, API latency)
