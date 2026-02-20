"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var UpscalerProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpscalerProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const python_executor_service_1 = require("../../python/python-executor.service");
let UpscalerProcessor = UpscalerProcessor_1 = class UpscalerProcessor extends bullmq_1.WorkerHost {
    constructor(pythonExecutor) {
        super();
        this.pythonExecutor = pythonExecutor;
        this.logger = new common_1.Logger(UpscalerProcessor_1.name);
    }
    async process(job) {
        const { method, config, jobId } = job.data;
        this.logger.log(`Processing ${method} upscale job: ${jobId}`);
        try {
            await job.updateProgress(10);
            const result = await this.pythonExecutor.executeUpscaler(method, config);
            await job.updateProgress(100);
            return {
                output_path: result.output_path,
                output_paths: result.output_paths,
                output_width: result.output_width,
                output_height: result.output_height,
                crop_info: result.crop_info,
                processing_time: result.processing_time,
                status: 'completed',
            };
        }
        catch (error) {
            this.logger.error(`Job ${jobId} failed: ${error.message}`);
            throw error;
        }
    }
};
exports.UpscalerProcessor = UpscalerProcessor;
exports.UpscalerProcessor = UpscalerProcessor = UpscalerProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('upscaler', {
        concurrency: 1,
    }),
    __metadata("design:paramtypes", [python_executor_service_1.PythonExecutorService])
], UpscalerProcessor);
//# sourceMappingURL=upscaler.processor.js.map