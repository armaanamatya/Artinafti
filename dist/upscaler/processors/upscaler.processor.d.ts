import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PythonExecutorService } from '../../python/python-executor.service';
export declare class UpscalerProcessor extends WorkerHost {
    private readonly pythonExecutor;
    private readonly logger;
    constructor(pythonExecutor: PythonExecutorService);
    process(job: Job<any, any, string>): Promise<any>;
}
