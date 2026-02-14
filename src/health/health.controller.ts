import { Controller, Get } from '@nestjs/common';
import { PythonExecutorService } from '../python/python-executor.service';

@Controller('api/health')
export class HealthController {
  constructor(private readonly pythonExecutor: PythonExecutorService) {}

  @Get()
  async getHealth() {
    return {
      status: 'healthy',
      python_worker_ready: this.pythonExecutor.getIsReady(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
