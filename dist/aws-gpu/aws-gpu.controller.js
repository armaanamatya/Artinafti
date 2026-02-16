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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsGpuController = void 0;
const common_1 = require("@nestjs/common");
const aws_gpu_service_1 = require("./aws-gpu.service");
const aws_gpu_dto_1 = require("./dto/aws-gpu.dto");
let AwsGpuController = class AwsGpuController {
    constructor(awsGpuService) {
        this.awsGpuService = awsGpuService;
    }
    async getInstanceTypes() {
        return this.awsGpuService.listGpuInstanceTypes();
    }
    async launchInstance(dto) {
        return this.awsGpuService.launchInstance(dto.name, dto.instance_type);
    }
    async listInstances() {
        return this.awsGpuService.listInstances();
    }
    async getInstanceStatus(instanceId) {
        return this.awsGpuService.getInstance(instanceId);
    }
    async startInstances(dto) {
        return this.awsGpuService.startInstances(dto.instance_ids);
    }
    async stopInstances(dto) {
        return this.awsGpuService.stopInstances(dto.instance_ids);
    }
    async terminateInstances(dto) {
        return this.awsGpuService.terminateInstances(dto.instance_ids);
    }
    async waitForRunning(instanceId) {
        return this.awsGpuService.waitForRunning(instanceId);
    }
    async shelveInstance(instanceId) {
        return this.awsGpuService.shelveInstance(instanceId);
    }
    async restoreInstance(dto) {
        return this.awsGpuService.restoreInstance(dto.ami_id, dto.name, dto.instance_type);
    }
    async listShelved() {
        return this.awsGpuService.listShelved();
    }
    async deleteShelved(amiId) {
        return this.awsGpuService.deleteShelved(amiId);
    }
};
exports.AwsGpuController = AwsGpuController;
__decorate([
    (0, common_1.Get)('instance-types'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "getInstanceTypes", null);
__decorate([
    (0, common_1.Post)('launch'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [aws_gpu_dto_1.LaunchAwsInstanceDto]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "launchInstance", null);
__decorate([
    (0, common_1.Get)('instances'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "listInstances", null);
__decorate([
    (0, common_1.Get)('status/:instanceId'),
    __param(0, (0, common_1.Param)('instanceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "getInstanceStatus", null);
__decorate([
    (0, common_1.Post)('start'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [aws_gpu_dto_1.InstanceIdsDto]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "startInstances", null);
__decorate([
    (0, common_1.Post)('stop'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [aws_gpu_dto_1.InstanceIdsDto]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "stopInstances", null);
__decorate([
    (0, common_1.Post)('terminate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [aws_gpu_dto_1.InstanceIdsDto]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "terminateInstances", null);
__decorate([
    (0, common_1.Post)('wait/:instanceId'),
    __param(0, (0, common_1.Param)('instanceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "waitForRunning", null);
__decorate([
    (0, common_1.Post)('shelve/:instanceId'),
    __param(0, (0, common_1.Param)('instanceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "shelveInstance", null);
__decorate([
    (0, common_1.Post)('restore'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [aws_gpu_dto_1.RestoreInstanceDto]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "restoreInstance", null);
__decorate([
    (0, common_1.Get)('shelved'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "listShelved", null);
__decorate([
    (0, common_1.Post)('shelved/delete/:amiId'),
    __param(0, (0, common_1.Param)('amiId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AwsGpuController.prototype, "deleteShelved", null);
exports.AwsGpuController = AwsGpuController = __decorate([
    (0, common_1.Controller)('api/aws-gpu'),
    __metadata("design:paramtypes", [aws_gpu_service_1.AwsGpuService])
], AwsGpuController);
//# sourceMappingURL=aws-gpu.controller.js.map