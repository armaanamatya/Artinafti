# Architecture Changes: NestJS-Centric Design

## Summary of Changes

The original plan used a **two-container architecture** (Python FastAPI + NestJS proxy). The new design **centralizes everything on NestJS** with Python scripts as child processes.

---

## Key Architecture Changes

### Before (FastAPI + NestJS Proxy)
```
Frontend → NestJS (Port 3000) → Python FastAPI (Port 8000) → Python Scripts
```

### After (NestJS-Centric)
```
Frontend → NestJS (Port 3000) → Python Child Processes (spawned directly)
```

---

## Benefits of New Architecture

1. **✅ Single Container**: Simpler deployment, no inter-container networking
2. **✅ Centralized on NestJS**: All business logic, auth, routing in one place
3. **✅ Direct Python Execution**: NestJS spawns Python processes via `child_process`
4. **✅ Bull Queue Integration**: Native NestJS job queue for async processing
5. **✅ Type Safety**: Full TypeScript benefits throughout the API
6. **✅ Easier Debugging**: Single application to monitor and debug
7. **✅ Lower Overhead**: No HTTP calls between containers

---

## Container Structure

**Single Hybrid Container** with:
- **Node.js 20** - Runs NestJS application
- **Python 3.11** - Runs ML scripts as child processes
- **PyTorch + CUDA 12.8** - GPU support for ML workloads
- **Redis** - Bull queue backend (separate container)
- **Pre-baked AI Models** - ~50GB of models in Docker image

---

## How It Works

### 1. Request Flow

```typescript
// 1. User uploads image via NestJS endpoint
POST /api/upscale/flux
  ↓
// 2. NestJS saves file to /app/uploads
  ↓
// 3. NestJS adds job to Bull queue
Queue.add('flux-upscale', { imagePath, config })
  ↓
// 4. Bull processor picks up job
FluxProcessor.process(job)
  ↓
// 5. Spawns Python child process
spawn('python3', ['run_upscaler.py', '--method', 'flux', ...])
  ↓
// 6. Python executes upscaling with GPU
  ↓
// 7. Returns output path via stdout (JSON)
  ↓
// 8. NestJS saves result, updates job status
  ↓
// 9. Frontend polls GET /api/status/{jobId}
  ↓
// 10. Downloads result from GET /api/result/{filename}
```

### 2. Python Execution Service

**`src/python/python-executor.service.ts`**
```typescript
async executeUpscaler(method: 'flux' | 'esrgan' | 'imagen', config: any) {
  const pythonProcess = spawn('python3', [
    'python-scripts/run_upscaler.py',
    '--method', method,
    '--config', JSON.stringify(config)
  ]);

  // Capture stdout/stderr
  // Parse JSON result
  // Return output path
}
```

### 3. Bull Queue Processor

**`src/upscaler/processors/flux.processor.ts`**
```typescript
@Processor('upscaler')
export class FluxProcessor extends WorkerHost {
  async process(job: Job) {
    switch (job.name) {
      case 'flux-upscale':
        const output = await this.pythonExecutor.executeUpscaler('flux', job.data);
        return { outputPath: output };
    }
  }
}
```

---

## Variable Dimension Handling

### New Feature: Automatic Dimension Calculation

The API now **automatically adapts to input image dimensions**:

#### Mode 1: Simple Upscaling (No Target Size)
```typescript
POST /api/upscale/flux
{
  file: <image file>,
  upscale_factor: 4  // Output = input × 4
}

// Input: 1024x768
// Output: 4096x3072 (automatically calculated)
```

#### Mode 2: Target Print Size
```typescript
POST /api/upscale/flux
{
  file: <image file>,
  target_width_inches: 20,
  target_height_inches: 10,
  target_dpi: 150
}

// Input: 1024x587 (aspect 1.74)
// Target: 20"×10" @ 150 DPI = 3000×1500px (aspect 2.0)
// Output: 3000×1719px (preserves input aspect, provides crop guidance)
```

#### Mode 3: DPI-Based Calculation
```typescript
POST /api/upscale/flux
{
  file: <image file>,
  target_dpi: 300,  // High-quality print
  upscale_factor: 4
}

// Calculates optimal output for print at 300 DPI
```

### Implementation in Python

**`python-scripts/utils/dimension_calculator.py`**
```python
def calculate_output_dimensions(input_width, input_height, **kwargs):
    """
    Flexible dimension calculator:
    - No target → simple upscale
    - Target print size → aspect-ratio-aware scaling
    - Preserves all notebook logic for print production
    """
```

This preserves all the smart aspect-ratio handling from your notebooks while making it work with **any input image size**.

---

## API Changes

### Endpoints (NestJS)

All endpoints now accept **multipart/form-data** (file uploads):

- **POST** `/api/upscale/flux` - FLUX upscaling (10-40 min)
- **POST** `/api/upscale/esrgan` - Real-ESRGAN upscaling (10-100 sec)
- **POST** `/api/upscale/imagen` - Google Imagen upscaling (15-20 sec)
- **GET** `/api/status/{jobId}` - Check job progress
- **GET** `/api/result/{filename}` - Download result
- **GET** `/api/health` - Health check

### Request Format

```typescript
// Example: FLUX upscale with automatic dimensions
const formData = new FormData();
formData.append('file', imageFile);
formData.append('upscale_factor', '4');
formData.append('denoise', '0.2');
formData.append('steps', '20');

const response = await fetch('/api/upscale/flux', {
  method: 'POST',
  body: formData
});

// Response
{
  "jobId": "uuid",
  "status": "queued",
  "estimatedTime": 1200,
  "inputSize": { "width": 1024, "height": 768 },
  "outputSize": { "width": 4096, "height": 3072 }  // Auto-calculated!
}
```

---

## Updated File Structure

```
project/
├── Dockerfile                    # Single hybrid container (Node + Python)
├── docker-compose.yml            # NestJS + Redis
├── package.json                  # NestJS dependencies
├── python-requirements.txt       # Python ML dependencies
├── tsconfig.json                 # TypeScript config
├── nest-cli.json                 # NestJS CLI config
├── src/                          # NestJS application
│   ├── main.ts
│   ├── app.module.ts
│   ├── upscaler/
│   │   ├── upscaler.controller.ts
│   │   ├── upscaler.service.ts
│   │   ├── processors/
│   │   │   ├── flux.processor.ts
│   │   │   ├── esrgan.processor.ts
│   │   │   └── imagen.processor.ts
│   │   └── dto/
│   ├── python/
│   │   ├── python-executor.service.ts
│   │   └── python.module.ts
│   └── health/
│       └── health.controller.ts
└── python-scripts/               # Python ML scripts
    ├── run_upscaler.py          # CLI entry point
    ├── services/
    │   ├── flux_upscaler.py
    │   ├── esrgan_upscaler.py
    │   └── imagen_upscaler.py
    └── utils/
        ├── dimension_calculator.py   # NEW: Variable dimension handling
        ├── image_utils.py
        └── gpu_utils.py
```

---

## What Didn't Change

✅ All three upscalers (FLUX, ESRGAN, Imagen) still supported
✅ Pre-baked models (~50GB Docker image)
✅ GPU support (CUDA 12.8)
✅ Async processing with queues
✅ AWS deployment strategy
✅ Model paths and configurations
✅ Aspect-ratio-aware print sizing logic from notebooks

---

## Migration Path

If you want to implement this:

1. **Phase 1**: Extract Python logic from notebooks → standalone scripts
2. **Phase 2**: Build NestJS application with Bull queue
3. **Phase 3**: Create Dockerfile with Node.js + Python
4. **Phase 4**: Test locally with docker-compose
5. **Phase 5**: Deploy to AWS EC2 with GPU
6. **Phase 6**: Share with supervisor

Same timeline: **13-18 days**

---

## Next Steps

1. ✅ **Review** this architecture change
2. ⏩ **Confirm** you want to proceed with NestJS-centric design
3. ⏩ **Start implementation** following `dockersetup.md`

The full implementation plan is in `dockersetup.md` with all the code examples updated for NestJS.
