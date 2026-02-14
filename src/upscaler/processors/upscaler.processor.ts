import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PythonExecutorService } from '../../python/python-executor.service';

@Processor('upscaler', {
  concurrency: 1, // One GPU job at a time
})
export class UpscalerProcessor extends WorkerHost {
  private readonly logger = new Logger(UpscalerProcessor.name);

  constructor(private readonly pythonExecutor: PythonExecutorService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
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
    } catch (error) {
      this.logger.error(`Job ${jobId} failed: ${error.message}`);
      throw error;
    }
  }
}
