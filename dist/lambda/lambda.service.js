"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var LambdaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LambdaService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_ssh_1 = require("node-ssh");
const LAMBDA_API_BASE = 'https://cloud.lambdalabs.com/api/v1';
let LambdaService = LambdaService_1 = class LambdaService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(LambdaService_1.name);
        this.apiKey = this.configService.get('lambda.apiKey');
        this.sshKeyName = this.configService.get('lambda.sshKeyName');
        this.defaultRegion = this.configService.get('lambda.defaultRegion');
        this.sshKeyPath = process.env.LAMBDA_SSH_KEY_PATH || '';
    }
    get headers() {
        return {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };
    }
    async listInstanceTypes() {
        const res = await fetch(`${LAMBDA_API_BASE}/instance-types`, {
            headers: this.headers,
        });
        if (!res.ok) {
            throw new common_1.HttpException(`Lambda API error: ${res.statusText}`, common_1.HttpStatus.BAD_GATEWAY);
        }
        const body = await res.json();
        return body.data;
    }
    async launchInstance(instanceTypeName, regionName, name) {
        const payload = {
            instance_type_name: instanceTypeName,
            region_name: regionName || this.defaultRegion,
            ssh_key_names: [this.sshKeyName],
        };
        if (name)
            payload.name = name;
        this.logger.log(`Launching ${instanceTypeName} in ${payload.region_name}...`);
        const res = await fetch(`${LAMBDA_API_BASE}/instance-operations/launch`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new common_1.HttpException(error.error?.message || `Launch failed: ${res.statusText}`, common_1.HttpStatus.BAD_GATEWAY);
        }
        const body = await res.json();
        this.logger.log(`Launched instance: ${JSON.stringify(body.data)}`);
        return body.data;
    }
    async getInstance(instanceId) {
        const res = await fetch(`${LAMBDA_API_BASE}/instances/${instanceId}`, {
            headers: this.headers,
        });
        if (!res.ok) {
            throw new common_1.HttpException(`Failed to get instance: ${res.statusText}`, common_1.HttpStatus.BAD_GATEWAY);
        }
        const body = await res.json();
        return body.data;
    }
    async listInstances() {
        const res = await fetch(`${LAMBDA_API_BASE}/instances`, {
            headers: this.headers,
        });
        if (!res.ok) {
            throw new common_1.HttpException(`Failed to list instances: ${res.statusText}`, common_1.HttpStatus.BAD_GATEWAY);
        }
        const body = await res.json();
        return body.data;
    }
    async terminateInstances(instanceIds) {
        this.logger.log(`Terminating instances: ${instanceIds.join(', ')}`);
        const res = await fetch(`${LAMBDA_API_BASE}/instance-operations/terminate`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ instance_ids: instanceIds }),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new common_1.HttpException(error.error?.message || `Terminate failed: ${res.statusText}`, common_1.HttpStatus.BAD_GATEWAY);
        }
        const body = await res.json();
        return body.data;
    }
    async deployToInstance(instanceIp) {
        const sshKeyPath = this.sshKeyPath;
        const ssh = new node_ssh_1.NodeSSH();
        this.logger.log(`Deploying to ${instanceIp}...`);
        try {
            await ssh.connect({
                host: instanceIp,
                username: 'ubuntu',
                privateKeyPath: sshKeyPath,
                readyTimeout: 30000,
            });
            await ssh.execCommand('which docker || (curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker ubuntu)');
            await ssh.execCommand('which docker-compose || sudo apt-get install -y docker-compose-plugin');
            const repoUrl = this.configService.get('lambda.repoUrl') || '';
            if (repoUrl) {
                await ssh.execCommand(`git clone ${repoUrl} /home/ubuntu/artinafti 2>/dev/null || (cd /home/ubuntu/artinafti && git pull)`);
                await ssh.execCommand('cd /home/ubuntu/artinafti && docker compose -f docker-compose.dev.yml up -d');
            }
            let healthy = false;
            for (let i = 0; i < 30; i++) {
                const result = await ssh.execCommand('curl -sf http://localhost:3000/api/health || true');
                if (result.stdout && result.stdout.includes('ok')) {
                    healthy = true;
                    break;
                }
                await new Promise((r) => setTimeout(r, 10000));
            }
            ssh.dispose();
            return {
                success: true,
                healthy,
                api_url: `http://${instanceIp}:3000`,
            };
        }
        catch (error) {
            ssh.dispose();
            this.logger.error(`Deploy failed: ${error.message}`);
            throw new common_1.HttpException(`Deploy failed: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.LambdaService = LambdaService;
exports.LambdaService = LambdaService = LambdaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LambdaService);
//# sourceMappingURL=lambda.service.js.map