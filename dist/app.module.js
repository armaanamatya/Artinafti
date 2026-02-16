"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const serve_static_1 = require("@nestjs/serve-static");
const path_1 = require("path");
const configuration_1 = require("./config/configuration");
const upscaler_module_1 = require("./upscaler/upscaler.module");
const python_module_1 = require("./python/python.module");
const health_module_1 = require("./health/health.module");
const lambda_module_1 = require("./lambda/lambda.module");
const aws_gpu_module_1 = require("./aws-gpu/aws-gpu.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
            }),
            bullmq_1.BullModule.forRoot({
                connection: {
                    host: process.env.REDIS_HOST || 'redis',
                    port: parseInt(process.env.REDIS_PORT || '6379', 10),
                },
            }),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(process.env.OUTPUT_DIR || '/app/results'),
                serveRoot: '/api/results',
            }),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'src', 'public'),
                serveRoot: '/',
                exclude: ['/api/(.*)'],
            }),
            upscaler_module_1.UpscalerModule,
            python_module_1.PythonModule,
            health_module_1.HealthModule,
            lambda_module_1.LambdaModule,
            aws_gpu_module_1.AwsGpuModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map