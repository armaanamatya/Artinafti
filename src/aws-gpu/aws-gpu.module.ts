import { Module } from '@nestjs/common';
import { AwsGpuController } from './aws-gpu.controller';
import { AwsGpuService } from './aws-gpu.service';

@Module({
  controllers: [AwsGpuController],
  providers: [AwsGpuService],
  exports: [AwsGpuService],
})
export class AwsGpuModule {}
