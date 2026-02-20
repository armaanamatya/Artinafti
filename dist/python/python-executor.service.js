"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PythonExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonExecutorService = void 0;
const common_1 = require("@nestjs/common");
const child_process_1 = require("child_process");
const path_1 = require("path");
const readline_1 = require("readline");
const uuid_1 = require("uuid");
let PythonExecutorService = PythonExecutorService_1 = class PythonExecutorService {
    constructor() {
        this.logger = new common_1.Logger(PythonExecutorService_1.name);
        this.pendingJobs = new Map();
        this.isReady = false;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 3;
    }
    async onModuleInit() {
        await this.startWorker();
    }
    onModuleDestroy() {
        this.pythonProcess?.kill();
    }
    getIsReady() {
        return this.isReady;
    }
    startWorker() {
        return new Promise((resolve) => {
            const workerPath = (0, path_1.join)(__dirname, '../../python-scripts/worker.py');
            const pythonPath = process.env.PYTHON_PATH || 'python3';
            this.logger.log(`Starting Python worker: ${pythonPath} ${workerPath}`);
            this.pythonProcess = (0, child_process_1.spawn)(pythonPath, ['-u', workerPath], {
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1',
                    CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES || '0',
                },
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: (0, path_1.join)(__dirname, '../../python-scripts'),
            });
            this.readline = (0, readline_1.createInterface)({ input: this.pythonProcess.stdout });
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
                            }
                            else {
                                pending.reject(new Error(msg.error));
                            }
                        }
                    }
                }
                catch (err) {
                    this.logger.warn(`Non-JSON from Python: ${line}`);
                }
            });
            this.pythonProcess.stderr.on('data', (data) => {
                this.logger.warn(`Python stderr: ${data}`);
            });
            this.pythonProcess.on('exit', (code) => {
                this.logger.error(`Python worker exited with code ${code}`);
                this.isReady = false;
                for (const [jobId, pending] of this.pendingJobs) {
                    pending.reject(new Error('Python worker crashed'));
                    this.pendingJobs.delete(jobId);
                }
                resolve();
                this.restartAttempts++;
                if (this.restartAttempts < this.maxRestartAttempts) {
                    setTimeout(() => this.startWorker(), 5000);
                }
                else {
                    this.logger.warn(`Python worker failed ${this.maxRestartAttempts} times — stopping retries. Install Python deps or run in Docker.`);
                }
            });
            setTimeout(() => {
                if (!this.isReady) {
                    this.logger.warn('Python worker startup timeout (120s) — may still be loading models');
                    resolve();
                }
            }, 120000);
        });
    }
    async executeUpscaler(method, config) {
        if (!this.isReady) {
            throw new Error('Python worker not ready — models still loading');
        }
        const jobId = (0, uuid_1.v4)();
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
};
exports.PythonExecutorService = PythonExecutorService;
exports.PythonExecutorService = PythonExecutorService = PythonExecutorService_1 = __decorate([
    (0, common_1.Injectable)()
], PythonExecutorService);
//# sourceMappingURL=python-executor.service.js.map