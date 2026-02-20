import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class PythonExecutorService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private pythonProcess;
    private readline;
    private pendingJobs;
    private isReady;
    private restartAttempts;
    private readonly maxRestartAttempts;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    getIsReady(): boolean;
    private startWorker;
    executeUpscaler(method: 'flux' | 'esrgan' | 'imagen', config: any): Promise<any>;
}
