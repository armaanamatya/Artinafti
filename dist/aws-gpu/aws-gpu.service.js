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
var AwsGpuService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsGpuService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_ec2_1 = require("@aws-sdk/client-ec2");
let AwsGpuService = AwsGpuService_1 = class AwsGpuService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(AwsGpuService_1.name);
        this.region = this.configService.get('aws.region');
        this.amiId = this.configService.get('aws.amiId');
        this.instanceType = this.configService.get('aws.instanceType');
        this.keyName = this.configService.get('aws.keyName');
        this.securityGroupIds = this.configService
            .get('aws.securityGroupIds')
            .split(',')
            .filter(Boolean);
        this.subnetId = this.configService.get('aws.subnetId');
        this.repoUrl = this.configService.get('aws.repoUrl');
        this.ec2 = new client_ec2_1.EC2Client({
            region: this.region,
        });
    }
    buildUserData() {
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
        return Buffer.from(bootScript).toString('base64');
    }
    async listGpuInstanceTypes() {
        const command = new client_ec2_1.DescribeInstanceTypesCommand({
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
        }
        catch (error) {
            this.logger.error(`Failed to list GPU instance types: ${error.message}`);
            throw new common_1.HttpException(`AWS error: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async launchInstance(name, instanceType) {
        const type = instanceType || this.instanceType;
        this.logger.log(`Launching ${type} in ${this.region}...`);
        const command = new client_ec2_1.RunInstancesCommand({
            ImageId: this.amiId,
            InstanceType: type,
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
        }
        catch (error) {
            this.logger.error(`Launch failed: ${error.message}`);
            throw new common_1.HttpException(`Launch failed: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async getInstance(instanceId) {
        const command = new client_ec2_1.DescribeInstancesCommand({
            InstanceIds: [instanceId],
        });
        try {
            const result = await this.ec2.send(command);
            const instance = result.Reservations?.[0]?.Instances?.[0];
            if (!instance) {
                throw new common_1.HttpException('Instance not found', common_1.HttpStatus.NOT_FOUND);
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
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException(`Failed to get instance: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async listInstances() {
        const command = new client_ec2_1.DescribeInstancesCommand({
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
            const instances = (result.Reservations || []).flatMap((r) => r.Instances || []);
            return instances.map((inst) => ({
                instance_id: inst.InstanceId,
                instance_type: inst.InstanceType,
                state: inst.State?.Name,
                ip: inst.PublicIpAddress || null,
                launch_time: inst.LaunchTime,
                name: inst.Tags?.find((t) => t.Key === 'Name')?.Value,
            }));
        }
        catch (error) {
            throw new common_1.HttpException(`Failed to list instances: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async stopInstances(instanceIds) {
        this.logger.log(`Stopping instances: ${instanceIds.join(', ')}`);
        const command = new client_ec2_1.StopInstancesCommand({
            InstanceIds: instanceIds,
        });
        try {
            const result = await this.ec2.send(command);
            return (result.StoppingInstances || []).map((i) => ({
                instance_id: i.InstanceId,
                previous_state: i.PreviousState?.Name,
                current_state: i.CurrentState?.Name,
            }));
        }
        catch (error) {
            throw new common_1.HttpException(`Stop failed: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async startInstances(instanceIds) {
        this.logger.log(`Starting instances: ${instanceIds.join(', ')}`);
        const command = new client_ec2_1.StartInstancesCommand({
            InstanceIds: instanceIds,
        });
        try {
            const result = await this.ec2.send(command);
            return (result.StartingInstances || []).map((i) => ({
                instance_id: i.InstanceId,
                previous_state: i.PreviousState?.Name,
                current_state: i.CurrentState?.Name,
            }));
        }
        catch (error) {
            throw new common_1.HttpException(`Start failed: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async terminateInstances(instanceIds) {
        this.logger.log(`Terminating instances: ${instanceIds.join(', ')}`);
        const command = new client_ec2_1.TerminateInstancesCommand({
            InstanceIds: instanceIds,
        });
        try {
            const result = await this.ec2.send(command);
            return (result.TerminatingInstances || []).map((i) => ({
                instance_id: i.InstanceId,
                previous_state: i.PreviousState?.Name,
                current_state: i.CurrentState?.Name,
            }));
        }
        catch (error) {
            throw new common_1.HttpException(`Terminate failed: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async shelveInstance(instanceId) {
        this.logger.log(`Shelving instance ${instanceId}...`);
        const instance = await this.getInstance(instanceId);
        if (instance.state === 'running') {
            await this.stopInstances([instanceId]);
            await (0, client_ec2_1.waitUntilInstanceStopped)({ client: this.ec2, maxWaitTime: 300 }, { InstanceIds: [instanceId] });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const amiName = `artinafti-shelved-${timestamp}`;
        const createImageCmd = new client_ec2_1.CreateImageCommand({
            InstanceId: instanceId,
            Name: amiName,
            Description: 'Shelved artinafti GPU instance',
            TagSpecifications: [
                {
                    ResourceType: 'image',
                    Tags: [
                        { Key: 'Project', Value: 'artinafti' },
                        { Key: 'ShelvedFrom', Value: instanceId },
                    ],
                },
            ],
        });
        try {
            const amiResult = await this.ec2.send(createImageCmd);
            const amiId = amiResult.ImageId;
            this.logger.log(`Created AMI ${amiId}, terminating instance...`);
            await this.terminateInstances([instanceId]);
            return {
                ami_id: amiId,
                ami_name: amiName,
                shelved_from: instanceId,
                message: 'Instance terminated. Use the ami_id with /api/aws-gpu/restore to launch a new instance from this snapshot.',
            };
        }
        catch (error) {
            throw new common_1.HttpException(`Shelve failed: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async restoreInstance(amiId, name, instanceType) {
        const type = instanceType || this.instanceType;
        this.logger.log(`Restoring from AMI ${amiId} as ${type}...`);
        const command = new client_ec2_1.RunInstancesCommand({
            ImageId: amiId,
            InstanceType: type,
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
                        { Key: 'RestoredFrom', Value: amiId },
                    ],
                },
            ],
        });
        try {
            const result = await this.ec2.send(command);
            const instance = result.Instances?.[0];
            return {
                instance_id: instance?.InstanceId,
                instance_type: instance?.InstanceType,
                state: instance?.State?.Name,
                restored_from: amiId,
            };
        }
        catch (error) {
            throw new common_1.HttpException(`Restore failed: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async listShelved() {
        const command = new client_ec2_1.DescribeImagesCommand({
            Owners: ['self'],
            Filters: [
                {
                    Name: 'tag:Project',
                    Values: ['artinafti'],
                },
            ],
        });
        try {
            const result = await this.ec2.send(command);
            return (result.Images || []).map((img) => ({
                ami_id: img.ImageId,
                name: img.Name,
                state: img.State,
                created: img.CreationDate,
                shelved_from: img.Tags?.find((t) => t.Key === 'ShelvedFrom')?.Value,
            }));
        }
        catch (error) {
            throw new common_1.HttpException(`Failed to list shelved AMIs: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async deleteShelved(amiId) {
        this.logger.log(`Deleting shelved AMI ${amiId}...`);
        try {
            const describeCmd = new client_ec2_1.DescribeImagesCommand({
                ImageIds: [amiId],
            });
            const imageResult = await this.ec2.send(describeCmd);
            const snapshotIds = (imageResult.Images?.[0]?.BlockDeviceMappings || [])
                .map((b) => b.Ebs?.SnapshotId)
                .filter(Boolean);
            await this.ec2.send(new client_ec2_1.DeregisterImageCommand({ ImageId: amiId }));
            for (const snapId of snapshotIds) {
                await this.ec2.send(new client_ec2_1.DeleteSnapshotCommand({ SnapshotId: snapId }));
            }
            return {
                deleted_ami: amiId,
                deleted_snapshots: snapshotIds,
                message: 'AMI and snapshots deleted. Storage charges stopped.',
            };
        }
        catch (error) {
            throw new common_1.HttpException(`Delete failed: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async waitForRunning(instanceId, timeoutSeconds = 300) {
        this.logger.log(`Waiting for ${instanceId} to reach running state...`);
        try {
            await (0, client_ec2_1.waitUntilInstanceRunning)({ client: this.ec2, maxWaitTime: timeoutSeconds }, { InstanceIds: [instanceId] });
            return this.getInstance(instanceId);
        }
        catch (error) {
            throw new common_1.HttpException(`Timed out waiting for instance: ${error.message}`, common_1.HttpStatus.GATEWAY_TIMEOUT);
        }
    }
};
exports.AwsGpuService = AwsGpuService;
exports.AwsGpuService = AwsGpuService = AwsGpuService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AwsGpuService);
//# sourceMappingURL=aws-gpu.service.js.map