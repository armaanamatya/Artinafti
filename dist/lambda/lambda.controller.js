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
exports.LambdaController = void 0;
const common_1 = require("@nestjs/common");
const lambda_service_1 = require("./lambda.service");
const launch_instance_dto_1 = require("./dto/launch-instance.dto");
let LambdaController = class LambdaController {
    constructor(lambdaService) {
        this.lambdaService = lambdaService;
    }
    async getInstanceTypes() {
        return this.lambdaService.listInstanceTypes();
    }
    async launchInstance(dto) {
        return this.lambdaService.launchInstance(dto.instance_type_name, dto.region_name, dto.name);
    }
    async listInstances() {
        return this.lambdaService.listInstances();
    }
    async getInstanceStatus(instanceId) {
        return this.lambdaService.getInstance(instanceId);
    }
    async deployToInstance(instanceId) {
        const instance = await this.lambdaService.getInstance(instanceId);
        if (!instance.ip) {
            return { success: false, error: 'Instance does not have an IP yet' };
        }
        return this.lambdaService.deployToInstance(instance.ip);
    }
    async terminateInstances(dto) {
        return this.lambdaService.terminateInstances(dto.instance_ids);
    }
};
exports.LambdaController = LambdaController;
__decorate([
    (0, common_1.Get)('instance-types'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LambdaController.prototype, "getInstanceTypes", null);
__decorate([
    (0, common_1.Post)('launch'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [launch_instance_dto_1.LaunchInstanceDto]),
    __metadata("design:returntype", Promise)
], LambdaController.prototype, "launchInstance", null);
__decorate([
    (0, common_1.Get)('instances'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LambdaController.prototype, "listInstances", null);
__decorate([
    (0, common_1.Get)('status/:instanceId'),
    __param(0, (0, common_1.Param)('instanceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LambdaController.prototype, "getInstanceStatus", null);
__decorate([
    (0, common_1.Post)('deploy/:instanceId'),
    __param(0, (0, common_1.Param)('instanceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LambdaController.prototype, "deployToInstance", null);
__decorate([
    (0, common_1.Post)('terminate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [launch_instance_dto_1.TerminateInstanceDto]),
    __metadata("design:returntype", Promise)
], LambdaController.prototype, "terminateInstances", null);
exports.LambdaController = LambdaController = __decorate([
    (0, common_1.Controller)('api/gpu'),
    __metadata("design:paramtypes", [lambda_service_1.LambdaService])
], LambdaController);
//# sourceMappingURL=lambda.controller.js.map