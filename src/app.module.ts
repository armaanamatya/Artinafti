import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import configuration from './config/configuration';
import { UpscalerModule } from './upscaler/upscaler.module';
import { PythonModule } from './python/python.module';
import { HealthModule } from './health/health.module';
import { LambdaModule } from './lambda/lambda.module';
import { AwsGpuModule } from './aws-gpu/aws-gpu.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.env.OUTPUT_DIR || '/app/results'),
      serveRoot: '/api/results',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'src', 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
    }),
    UpscalerModule,
    PythonModule,
    HealthModule,
    LambdaModule,
    AwsGpuModule,
  ],
})
export class AppModule {}
