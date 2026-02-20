import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UpscalerController } from './upscaler.controller';
import { UpscalerService } from './upscaler.service';
import { UpscalerProcessor } from './processors/upscaler.processor';
import { PythonModule } from '../python/python.module';

const isLocalMode = process.env.LOCAL_MODE === 'true';

const optionalImports = [];
const optionalProviders = [];

if (!isLocalMode) {
  optionalImports.push(
    BullModule.registerQueue({ name: 'upscaler' }),
  );
  optionalProviders.push(UpscalerProcessor);
}

@Module({
  imports: [
    ...optionalImports,
    PythonModule,
  ],
  controllers: [UpscalerController],
  providers: [UpscalerService, ...optionalProviders],
})
export class UpscalerModule {}
