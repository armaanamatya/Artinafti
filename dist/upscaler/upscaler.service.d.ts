import { Queue } from 'bullmq';
export declare class UpscalerService {
    private readonly upscalerQueue;
    private readonly logger;
    constructor(upscalerQueue: Queue);
    queueUpscale(method: 'flux' | 'esrgan' | 'imagen', filePath: string, options: any): Promise<{
        jobId: string;
        status: string;
        method: "flux" | "esrgan" | "imagen";
    }>;
    getJobStatus(jobId: string): Promise<any>;
    getResultPath(filename: string): Promise<string>;
}
