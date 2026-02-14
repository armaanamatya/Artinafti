import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { existsSync } from 'fs';

@Injectable()
export class UpscalerService {
  private readonly logger = new Logger(UpscalerService.name);

  constructor(
    @InjectQueue('upscaler') private readonly upscalerQueue: Queue,
  ) {}

  async queueUpscale(
    method: 'flux' | 'esrgan' | 'imagen',
    filePath: string,
    options: any,
  ) {
    const jobId = uuidv4();
    const outputDir = process.env.OUTPUT_DIR || '/app/results';

    const config = {
      image_path: filePath,
      output_dir: outputDir,
      output_name: jobId,
      ...options,
    };

    // Map DTO field names to Python config keys
    if (options.model) config.model = options.model;
    if (options.upscale_model) config.upscale_model = options.upscale_model;

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

  async getJobStatus(jobId: string) {
    const job = await this.upscalerQueue.getJob(jobId);

    if (!job) {
      return { jobId, status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job.progress;

    const result: any = {
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

      // Generate download URL
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

  async getResultPath(filename: string): Promise<string> {
    const outputDir = process.env.OUTPUT_DIR || '/app/results';
    const filePath = join(outputDir, filename);

    if (!existsSync(filePath)) {
      throw new Error(`Result file not found: ${filename}`);
    }

    return filePath;
  }
}
