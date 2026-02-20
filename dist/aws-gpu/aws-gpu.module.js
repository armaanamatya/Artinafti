"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsGpuModule = void 0;
const common_1 = require("@nestjs/common");
const aws_gpu_controller_1 = require("./aws-gpu.controller");
const aws_gpu_service_1 = require("./aws-gpu.service");
let AwsGpuModule = class AwsGpuModule {
};
exports.AwsGpuModule = AwsGpuModule;
exports.AwsGpuModule = AwsGpuModule = __decorate([
    (0, common_1.Module)({
        controllers: [aws_gpu_controller_1.AwsGpuController],
        providers: [aws_gpu_service_1.AwsGpuService],
        exports: [aws_gpu_service_1.AwsGpuService],
    })
], AwsGpuModule);
//# sourceMappingURL=aws-gpu.module.js.map