import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { LambdaService } from './lambda.service';
import { LaunchInstanceDto, TerminateInstanceDto } from './dto/launch-instance.dto';

@Controller('api/gpu')
export class LambdaController {
  constructor(private readonly lambdaService: LambdaService) {}

  @Get('instance-types')
  async getInstanceTypes() {
    return this.lambdaService.listInstanceTypes();
  }

  @Post('launch')
  async launchInstance(@Body() dto: LaunchInstanceDto) {
    return this.lambdaService.launchInstance(
      dto.instance_type_name,
      dto.region_name,
      dto.name,
    );
  }

  @Get('instances')
  async listInstances() {
    return this.lambdaService.listInstances();
  }

  @Get('status/:instanceId')
  async getInstanceStatus(@Param('instanceId') instanceId: string) {
    return this.lambdaService.getInstance(instanceId);
  }

  @Post('deploy/:instanceId')
  async deployToInstance(@Param('instanceId') instanceId: string) {
    const instance = await this.lambdaService.getInstance(instanceId);
    if (!instance.ip) {
      return { success: false, error: 'Instance does not have an IP yet' };
    }
    return this.lambdaService.deployToInstance(instance.ip);
  }

  @Post('terminate')
  async terminateInstances(@Body() dto: TerminateInstanceDto) {
    return this.lambdaService.terminateInstances(dto.instance_ids);
  }
}
