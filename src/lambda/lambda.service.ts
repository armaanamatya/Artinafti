import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeSSH } from 'node-ssh';

const LAMBDA_API_BASE = 'https://cloud.lambdalabs.com/api/v1';

@Injectable()
export class LambdaService {
  private readonly logger = new Logger(LambdaService.name);
  private readonly apiKey: string;
  private readonly sshKeyName: string;
  private readonly defaultRegion: string;
  private readonly sshKeyPath: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('lambda.apiKey');
    this.sshKeyName = this.configService.get<string>('lambda.sshKeyName');
    this.defaultRegion = this.configService.get<string>('lambda.defaultRegion');
    this.sshKeyPath = process.env.LAMBDA_SSH_KEY_PATH || '';
  }

  private get headers() {
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
      throw new HttpException(
        `Lambda API error: ${res.statusText}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = await res.json();
    return body.data;
  }

  async launchInstance(
    instanceTypeName: string,
    regionName: string,
    name?: string,
  ) {
    const payload: any = {
      instance_type_name: instanceTypeName,
      region_name: regionName || this.defaultRegion,
      ssh_key_names: [this.sshKeyName],
    };

    if (name) payload.name = name;

    this.logger.log(
      `Launching ${instanceTypeName} in ${payload.region_name}...`,
    );

    const res = await fetch(
      `${LAMBDA_API_BASE}/instance-operations/launch`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new HttpException(
        error.error?.message || `Launch failed: ${res.statusText}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = await res.json();
    this.logger.log(`Launched instance: ${JSON.stringify(body.data)}`);
    return body.data;
  }

  async getInstance(instanceId: string) {
    const res = await fetch(`${LAMBDA_API_BASE}/instances/${instanceId}`, {
      headers: this.headers,
    });

    if (!res.ok) {
      throw new HttpException(
        `Failed to get instance: ${res.statusText}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = await res.json();
    return body.data;
  }

  async listInstances() {
    const res = await fetch(`${LAMBDA_API_BASE}/instances`, {
      headers: this.headers,
    });

    if (!res.ok) {
      throw new HttpException(
        `Failed to list instances: ${res.statusText}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = await res.json();
    return body.data;
  }

  async terminateInstances(instanceIds: string[]) {
    this.logger.log(`Terminating instances: ${instanceIds.join(', ')}`);

    const res = await fetch(
      `${LAMBDA_API_BASE}/instance-operations/terminate`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ instance_ids: instanceIds }),
      },
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new HttpException(
        error.error?.message || `Terminate failed: ${res.statusText}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = await res.json();
    return body.data;
  }

  async deployToInstance(instanceIp: string) {
    const sshKeyPath = this.sshKeyPath;
    const ssh = new NodeSSH();

    this.logger.log(`Deploying to ${instanceIp}...`);

    try {
      await ssh.connect({
        host: instanceIp,
        username: 'ubuntu',
        privateKeyPath: sshKeyPath,
        readyTimeout: 30000,
      });

      // Install Docker if not present
      await ssh.execCommand(
        'which docker || (curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker ubuntu)',
      );

      // Install docker-compose
      await ssh.execCommand(
        'which docker-compose || sudo apt-get install -y docker-compose-plugin',
      );

      // Clone repo and start services
      const repoUrl =
        this.configService.get<string>('lambda.repoUrl') || '';

      if (repoUrl) {
        await ssh.execCommand(
          `git clone ${repoUrl} /home/ubuntu/artinafti 2>/dev/null || (cd /home/ubuntu/artinafti && git pull)`,
        );
        await ssh.execCommand(
          'cd /home/ubuntu/artinafti && docker compose -f docker-compose.dev.yml up -d',
        );
      }

      // Wait for health check
      let healthy = false;
      for (let i = 0; i < 30; i++) {
        const result = await ssh.execCommand(
          'curl -sf http://localhost:3000/api/health || true',
        );
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
    } catch (error) {
      ssh.dispose();
      this.logger.error(`Deploy failed: ${error.message}`);
      throw new HttpException(
        `Deploy failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
