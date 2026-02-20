import { Queue } from 'bullmq';
import { PythonExecutorService } from '../python/python-executor.service';
export declare class UpscalerService {
    private readonly upscalerQueue;
    private readonly pythonExecutor;
    private readonly logger;
    private readonly localJobs;
    constructor(upscalerQueue: Queue, pythonExecutor: PythonExecutorService);
    queueUpscale(method: 'flux' | 'esrgan' | 'imagen', filePath: string, options: any): Promise<{
        jobId: string;
        status: string;
        method: "flux" | "esrgan" | "imagen";
    }>;
    private runLocal;
    getJobStatus(jobId: string): Promise<any>;
    private getLocalJobStatus;
    getResultPath(filename: string): Promise<string>;
}
