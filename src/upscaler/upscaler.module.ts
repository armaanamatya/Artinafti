import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UpscalerController } from './upscaler.controller';
import { UpscalerService } from './upscaler.service';
import { UpscalerProcessor } from './processors/upscaler.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'upscaler',
    }),
  ],
  controllers: [UpscalerController],
  providers: [UpscalerService, UpscalerProcessor],
})
export class UpscalerModule {}
