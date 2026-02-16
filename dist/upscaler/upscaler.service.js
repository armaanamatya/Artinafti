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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var UpscalerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpscalerService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const uuid_1 = require("uuid");
const path_1 = require("path");
const fs_1 = require("fs");
let UpscalerService = UpscalerService_1 = class UpscalerService {
    constructor(upscalerQueue) {
        this.upscalerQueue = upscalerQueue;
        this.logger = new common_1.Logger(UpscalerService_1.name);
    }
    async queueUpscale(method, filePath, options) {
        const jobId = (0, uuid_1.v4)();
        const outputDir = process.env.OUTPUT_DIR || '/app/results';
        const config = {
            image_path: filePath,
            output_dir: outputDir,
            output_name: jobId,
            ...options,
        };
        if (options.model)
            config.model = options.model;
        if (options.upscale_model)
            config.upscale_model = options.upscale_model;
        const jobName = `${method}-upscale`;
        const job = await this.upscalerQueue.add(jobName, {
            method,
            config,
            jobId,
        }, {
            jobId,
            attempts: 1,
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 7200 },
        });
        this.logger.log(`Queued ${method} upscale job: ${jobId}`);
        return {
            jobId,
            status: 'queued',
            method,
        };
    }
    async getJobStatus(jobId) {
        const job = await this.upscalerQueue.getJob(jobId);
        if (!job) {
            return { jobId, status: 'not_found' };
        }
        const state = await job.getState();
        const progress = job.progress;
        const result = {
            jobId,
            status: state,
            progress: typeof progress === 'number' ? progress : 0,
        };
        if (state === 'completed' && job.returnvalue) {
            result.output_path = job.returnvalue.output_path;
            result.output_width = job.returnvalue.output_width;
            result.output_height = job.returnvalue.output_height;
            result.crop_info = job.returnvalue.crop_info;
            result.processing_time = job.returnvalue.processing_time;
            if (job.returnvalue.output_path) {
                const filename = job.returnvalue.output_path.split('/').pop();
                result.output_url = `/api/results/${filename}`;
            }
        }
        if (state === 'failed') {
            result.error = job.failedReason;
        }
        return result;
    }
    async getResultPath(filename) {
        const outputDir = process.env.OUTPUT_DIR || '/app/results';
        const filePath = (0, path_1.join)(outputDir, filename);
        if (!(0, fs_1.existsSync)(filePath)) {
            throw new Error(`Result file not found: ${filename}`);
        }
        return filePath;
    }
};
exports.UpscalerService = UpscalerService;
exports.UpscalerService = UpscalerService = UpscalerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)('upscaler')),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], UpscalerService);
//# sourceMappingURL=upscaler.service.js.map