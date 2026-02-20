import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { existsSync } from 'fs';
import { PythonExecutorService } from '../python/python-executor.service';

const isLocalMode = process.env.LOCAL_MODE === 'true';

interface LocalJob {
  jobId: string;
  method: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
}

@Injectable()
export class UpscalerService {
  private readonly logger = new Logger(UpscalerService.name);
  private readonly localJobs = new Map<string, LocalJob>();

  constructor(
    @Optional() @InjectQueue('upscaler') private readonly upscalerQueue: Queue,
    private readonly pythonExecutor: PythonExecutorService,
  ) {}

  async queueUpscale(
    method: 'flux' | 'esrgan' | 'imagen',
    filePath: string,
    options: any,
  ) {
    const jobId = uuidv4();
    const outputDir = process.env.OUTPUT_DIR || './results';

    const config = {
      image_path: filePath,
      output_dir: outputDir,
      output_name: jobId,
      ...options,
    };

    if (options.model) config.model = options.model;
    if (options.upscale_model) config.upscale_model = options.upscale_model;

    if (isLocalMode) {
      return this.runLocal(jobId, method, config);
    }

    // Remote mode: use BullMQ
    const jobName = `${method}-upscale`;
    await this.upscalerQueue.add(jobName, {
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

    return { jobId, status: 'queued', method };
  }

  private async runLocal(
    jobId: string,
    method: 'flux' | 'esrgan' | 'imagen',
    config: any,
  ) {
    const localJob: LocalJob = {
      jobId,
      method,
      status: 'queued',
      progress: 0,
    };
    this.localJobs.set(jobId, localJob);

    this.logger.log(`[LOCAL] Running ${method} upscale job: ${jobId}`);

    // Run async — don't block the response
    (async () => {
      try {
        localJob.status = 'processing';
        localJob.progress = 10;

        const result = await this.pythonExecutor.executeUpscaler(method, config);

        localJob.status = 'completed';
        localJob.progress = 100;
        localJob.result = result;
      } catch (err) {
        localJob.status = 'failed';
        localJob.error = err.message;
        this.logger.error(`[LOCAL] Job ${jobId} failed: ${err.message}`);
      }
    })();

    return { jobId, status: 'queued', method };
  }

  async getJobStatus(jobId: string) {
    if (isLocalMode) {
      return this.getLocalJobStatus(jobId);
    }

    // Remote mode: query BullMQ
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

  private getLocalJobStatus(jobId: string) {
    const job = this.localJobs.get(jobId);
    if (!job) {
      return { jobId, status: 'not_found' };
    }

    const result: any = {
      jobId,
      status: job.status,
      progress: job.progress,
    };

    if (job.status === 'completed' && job.result) {
      result.output_path = job.result.output_path;
      result.output_width = job.result.output_width;
      result.output_height = job.result.output_height;
      result.crop_info = job.result.crop_info;
      result.processing_time = job.result.processing_time;

      if (job.result.output_path) {
        const filename = job.result.output_path.split(/[/\\]/).pop();
        result.output_url = `/api/results/${filename}`;
      }
    }

    if (job.status === 'failed') {
      result.error = job.error;
    }

    return result;
  }

  async getResultPath(filename: string): Promise<string> {
    const outputDir = process.env.OUTPUT_DIR || './results';
    const filePath = join(outputDir, filename);

    if (!existsSync(filePath)) {
      throw new Error(`Result file not found: ${filename}`);
    }

    return filePath;
  }
}
