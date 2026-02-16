import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  DescribeInstanceTypesCommand,
  waitUntilInstanceRunning,
} from '@aws-sdk/client-ec2';

@Injectable()
export class AwsGpuService {
  private readonly logger = new Logger(AwsGpuService.name);
  private readonly ec2: EC2Client;
  private readonly amiId: string;
  private readonly instanceType: string;
  private readonly keyName: string;
  private readonly securityGroupIds: string[];
  private readonly subnetId: string;
  private readonly region: string;
  private readonly repoUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('aws.region');
    this.amiId = this.configService.get<string>('aws.amiId');
    this.instanceType = this.configService.get<string>('aws.instanceType');
    this.keyName = this.configService.get<string>('aws.keyName');
    this.securityGroupIds = this.configService
      .get<string>('aws.securityGroupIds')
      .split(',')
      .filter(Boolean);
    this.subnetId = this.configService.get<string>('aws.subnetId');
    this.repoUrl = this.configService.get<string>('aws.repoUrl');

    this.ec2 = new EC2Client({
      region: this.region,
      // Uses AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY from env automatically
    });
  }

  private buildUserData(): string {
    // Content-Type: multipart/mixed with cloud-boothook ensures
    // this script runs on EVERY boot (start/stop cycles), not just first launch.
    const bootScript = `Content-Type: multipart/mixed; boundary="==BOUNDARY=="
MIME-Version: 1.0

--==BOUNDARY==
Content-Type: text/cloud-boothook; charset="us-ascii"

#!/bin/bash
set -e

# Log everything for debugging
exec >> /var/log/artinafti-startup.log 2>&1

echo "=== Artinafti GPU startup $(date) ==="

# Install docker-compose plugin if missing
if ! docker compose version &>/dev/null; then
  apt-get update && apt-get install -y docker-compose-plugin
fi

# Clone or pull the repo
if [ -d /home/ubuntu/artinafti ]; then
  cd /home/ubuntu/artinafti && git pull
else
  git clone ${this.repoUrl} /home/ubuntu/artinafti
fi

cd /home/ubuntu/artinafti

# Start services (restart: always handles subsequent boots, but this covers first boot + pulls latest)
docker compose -f docker-compose.dev.yml up -d --build

echo "=== Startup complete $(date) ==="

--==BOUNDARY==--
`;
    // EC2 user-data must be base64-encoded
    return Buffer.from(bootScript).toString('base64');
  }

  async listGpuInstanceTypes() {
    const command = new DescribeInstanceTypesCommand({
      Filters: [
        {
          Name: 'accelerator-type',
          Values: ['gpu'],
        },
      ],
    });

    try {
      const result = await this.ec2.send(command);
      return (result.InstanceTypes || []).map((it) => ({
        instanceType: it.InstanceType,
        vcpus: it.VCpuInfo?.DefaultVCpus,
        memoryMiB: it.MemoryInfo?.SizeInMiB,
        gpus: it.GpuInfo?.Gpus?.map((g) => ({
          name: g.Name,
          manufacturer: g.Manufacturer,
          count: g.Count,
          memoryMiB: g.MemoryInfo?.SizeInMiB,
        })),
      }));
    } catch (error) {
      this.logger.error(`Failed to list GPU instance types: ${error.message}`);
      throw new HttpException(
        `AWS error: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async launchInstance(name?: string, instanceType?: string) {
    const type = instanceType || this.instanceType;

    this.logger.log(`Launching ${type} in ${this.region}...`);

    const command = new RunInstancesCommand({
      ImageId: this.amiId,
      InstanceType: type as any,
      KeyName: this.keyName,
      SecurityGroupIds: this.securityGroupIds,
      SubnetId: this.subnetId || undefined,
      MinCount: 1,
      MaxCount: 1,
      UserData: this.buildUserData(),
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: name || 'artinafti-gpu' },
            { Key: 'Project', Value: 'artinafti' },
          ],
        },
      ],
      // Attach an IAM instance profile if needed for ECR pulls, etc.
    });

    try {
      const result = await this.ec2.send(command);
      const instance = result.Instances?.[0];

      this.logger.log(`Launched instance: ${instance?.InstanceId}`);

      return {
        instance_id: instance?.InstanceId,
        instance_type: instance?.InstanceType,
        state: instance?.State?.Name,
        launch_time: instance?.LaunchTime,
      };
    } catch (error) {
      this.logger.error(`Launch failed: ${error.message}`);
      throw new HttpException(
        `Launch failed: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getInstance(instanceId: string) {
    const command = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });

    try {
      const result = await this.ec2.send(command);
      const instance = result.Reservations?.[0]?.Instances?.[0];

      if (!instance) {
        throw new HttpException('Instance not found', HttpStatus.NOT_FOUND);
      }

      return {
        instance_id: instance.InstanceId,
        instance_type: instance.InstanceType,
        state: instance.State?.Name,
        ip: instance.PublicIpAddress || null,
        private_ip: instance.PrivateIpAddress || null,
        launch_time: instance.LaunchTime,
        tags: instance.Tags,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to get instance: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async listInstances() {
    const command = new DescribeInstancesCommand({
      Filters: [
        {
          Name: 'tag:Project',
          Values: ['artinafti'],
        },
        {
          Name: 'instance-state-name',
          Values: ['pending', 'running', 'stopping', 'stopped'],
        },
      ],
    });

    try {
      const result = await this.ec2.send(command);
      const instances = (result.Reservations || []).flatMap(
        (r) => r.Instances || [],
      );

      return instances.map((inst) => ({
        instance_id: inst.InstanceId,
        instance_type: inst.InstanceType,
        state: inst.State?.Name,
        ip: inst.PublicIpAddress || null,
        launch_time: inst.LaunchTime,
        name: inst.Tags?.find((t) => t.Key === 'Name')?.Value,
      }));
    } catch (error) {
      throw new HttpException(
        `Failed to list instances: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async stopInstances(instanceIds: string[]) {
    this.logger.log(`Stopping instances: ${instanceIds.join(', ')}`);

    const command = new StopInstancesCommand({
      InstanceIds: instanceIds,
    });

    try {
      const result = await this.ec2.send(command);
      return (result.StoppingInstances || []).map((i) => ({
        instance_id: i.InstanceId,
        previous_state: i.PreviousState?.Name,
        current_state: i.CurrentState?.Name,
      }));
    } catch (error) {
      throw new HttpException(
        `Stop failed: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async startInstances(instanceIds: string[]) {
    this.logger.log(`Starting instances: ${instanceIds.join(', ')}`);

    const command = new StartInstancesCommand({
      InstanceIds: instanceIds,
    });

    try {
      const result = await this.ec2.send(command);
      return (result.StartingInstances || []).map((i) => ({
        instance_id: i.InstanceId,
        previous_state: i.PreviousState?.Name,
        current_state: i.CurrentState?.Name,
      }));
    } catch (error) {
      throw new HttpException(
        `Start failed: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async terminateInstances(instanceIds: string[]) {
    this.logger.log(`Terminating instances: ${instanceIds.join(', ')}`);

    const command = new TerminateInstancesCommand({
      InstanceIds: instanceIds,
    });

    try {
      const result = await this.ec2.send(command);
      return (result.TerminatingInstances || []).map((i) => ({
        instance_id: i.InstanceId,
        previous_state: i.PreviousState?.Name,
        current_state: i.CurrentState?.Name,
      }));
    } catch (error) {
      throw new HttpException(
        `Terminate failed: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async waitForRunning(instanceId: string, timeoutSeconds = 300) {
    this.logger.log(
      `Waiting for ${instanceId} to reach running state...`,
    );

    try {
      await waitUntilInstanceRunning(
        { client: this.ec2, maxWaitTime: timeoutSeconds },
        { InstanceIds: [instanceId] },
      );

      // Fetch the instance to get the public IP
      return this.getInstance(instanceId);
    } catch (error) {
      throw new HttpException(
        `Timed out waiting for instance: ${error.message}`,
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
  }
}
