import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { AwsGpuService } from './aws-gpu.service';
import {
  LaunchAwsInstanceDto,
  InstanceIdsDto,
  RestoreInstanceDto,
} from './dto/aws-gpu.dto';

@Controller('api/aws-gpu')
export class AwsGpuController {
  constructor(private readonly awsGpuService: AwsGpuService) {}

  @Get('instance-types')
  async getInstanceTypes() {
    return this.awsGpuService.listGpuInstanceTypes();
  }

  @Post('launch')
  async launchInstance(@Body() dto: LaunchAwsInstanceDto) {
    return this.awsGpuService.launchInstance(dto.name, dto.instance_type);
  }

  @Get('instances')
  async listInstances() {
    return this.awsGpuService.listInstances();
  }

  @Get('status/:instanceId')
  async getInstanceStatus(@Param('instanceId') instanceId: string) {
    return this.awsGpuService.getInstance(instanceId);
  }

  @Post('start')
  async startInstances(@Body() dto: InstanceIdsDto) {
    return this.awsGpuService.startInstances(dto.instance_ids);
  }

  @Post('stop')
  async stopInstances(@Body() dto: InstanceIdsDto) {
    return this.awsGpuService.stopInstances(dto.instance_ids);
  }

  @Post('terminate')
  async terminateInstances(@Body() dto: InstanceIdsDto) {
    return this.awsGpuService.terminateInstances(dto.instance_ids);
  }

  @Post('wait/:instanceId')
  async waitForRunning(@Param('instanceId') instanceId: string) {
    return this.awsGpuService.waitForRunning(instanceId);
  }

  // --- Shelve/Restore (true $0 idle cost) ---

  @Post('shelve/:instanceId')
  async shelveInstance(@Param('instanceId') instanceId: string) {
    return this.awsGpuService.shelveInstance(instanceId);
  }

  @Post('restore')
  async restoreInstance(@Body() dto: RestoreInstanceDto) {
    return this.awsGpuService.restoreInstance(
      dto.ami_id,
      dto.name,
      dto.instance_type,
    );
  }

  @Get('shelved')
  async listShelved() {
    return this.awsGpuService.listShelved();
  }

  @Post('shelved/delete/:amiId')
  async deleteShelved(@Param('amiId') amiId: string) {
    return this.awsGpuService.deleteShelved(amiId);
  }
}
