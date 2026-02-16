import { PythonExecutorService } from '../python/python-executor.service';
export declare class HealthController {
    private readonly pythonExecutor;
    constructor(pythonExecutor: PythonExecutorService);
    getHealth(): Promise<{
        status: string;
        python_worker_ready: boolean;
        timestamp: string;
        environment: string;
    }>;
}
