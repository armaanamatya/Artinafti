import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { createInterface, Interface } from 'readline';
import { v4 as uuidv4 } from 'uuid';

interface PendingJob {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

@Injectable()
export class PythonExecutorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PythonExecutorService.name);
  private pythonProcess: ChildProcess;
  private readline: Interface;
  private pendingJobs = new Map<string, PendingJob>();
  private isReady = false;

  async onModuleInit() {
    await this.startWorker();
  }

  onModuleDestroy() {
    this.pythonProcess?.kill();
  }

  getIsReady(): boolean {
    return this.isReady;
  }

  private startWorker(): Promise<void> {
    return new Promise((resolve) => {
      const workerPath = join(__dirname, '../../python-scripts/worker.py');
      const pythonPath = process.env.PYTHON_PATH || 'python3';

      this.logger.log(`Starting Python worker: ${pythonPath} ${workerPath}`);

      this.pythonProcess = spawn(pythonPath, ['-u', workerPath], {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES || '0',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: join(__dirname, '../../python-scripts'),
      });

      this.readline = createInterface({ input: this.pythonProcess.stdout });

      this.readline.on('line', (line) => {
        try {
          const msg = JSON.parse(line);

          if (msg.type === 'status') {
            this.logger.log(`Python worker status: ${msg.message}`);
            if (msg.message === 'ready') {
              this.isReady = true;
              resolve();
            }
            return;
          }

          if (msg.type === 'warning') {
            this.logger.warn(`Python worker warning: ${msg.message}`);
            return;
          }

          if (msg.type === 'result' || msg.type === 'error') {
            const pending = this.pendingJobs.get(msg.job_id);
            if (pending) {
              this.pendingJobs.delete(msg.job_id);
              if (msg.type === 'result') {
                pending.resolve(msg);
              } else {
                pending.reject(new Error(msg.error));
              }
            }
          }
        } catch (err) {
          this.logger.warn(`Non-JSON from Python: ${line}`);
        }
      });

      this.pythonProcess.stderr.on('data', (data) => {
        this.logger.warn(`Python stderr: ${data}`);
      });

      this.pythonProcess.on('exit', (code) => {
        this.logger.error(`Python worker exited with code ${code}`);
        this.isReady = false;

        // Reject all pending jobs
        for (const [jobId, pending] of this.pendingJobs) {
          pending.reject(new Error('Python worker crashed'));
          this.pendingJobs.delete(jobId);
        }

        // Auto-restart after 5 seconds
        setTimeout(() => this.startWorker(), 5000);
      });

      // Timeout for initial startup (models can take 30-60s to load)
      setTimeout(() => {
        if (!this.isReady) {
          this.logger.warn(
            'Python worker startup timeout (120s) — may still be loading models',
          );
          resolve();
        }
      }, 120000);
    });
  }

  async executeUpscaler(
    method: 'flux' | 'esrgan' | 'imagen',
    config: any,
  ): Promise<any> {
    if (!this.isReady) {
      throw new Error('Python worker not ready — models still loading');
    }

    const jobId = uuidv4();

    return new Promise((resolve, reject) => {
      this.pendingJobs.set(jobId, { resolve, reject });

      const job = JSON.stringify({
        job_id: jobId,
        method,
        config,
      });

      this.pythonProcess.stdin.write(job + '\n');
    });
  }
}
