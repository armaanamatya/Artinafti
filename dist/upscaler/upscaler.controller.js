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
exports.UpscalerController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const upscaler_service_1 = require("./upscaler.service");
const dto_1 = require("./dto");
const multer_1 = require("multer");
const uuid_1 = require("uuid");
const path_1 = require("path");
const uploadStorage = (0, multer_1.diskStorage)({
    destination: process.env.UPLOAD_DIR || './uploads',
    filename: (req, file, cb) => {
        const uniqueName = `${(0, uuid_1.v4)()}${(0, path_1.extname)(file.originalname)}`;
        cb(null, uniqueName);
    },
});
const fileValidators = new common_1.ParseFilePipe({
    validators: [
        new common_1.MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
    ],
});
let UpscalerController = class UpscalerController {
    constructor(upscalerService) {
        this.upscalerService = upscalerService;
    }
    async upscaleFlux(file, dto) {
        return this.upscalerService.queueUpscale('flux', file.path, dto);
    }
    async upscaleEsrgan(file, dto) {
        return this.upscalerService.queueUpscale('esrgan', file.path, dto);
    }
    async upscaleImagen(file, dto) {
        return this.upscalerService.queueUpscale('imagen', file.path, dto);
    }
    async getStatus(jobId) {
        return this.upscalerService.getJobStatus(jobId);
    }
    async downloadResult(filename, res) {
        try {
            const filePath = await this.upscalerService.getResultPath(filename);
            res.sendFile(filePath);
        }
        catch {
            throw new common_1.NotFoundException('Result file not found');
        }
    }
};
exports.UpscalerController = UpscalerController;
__decorate([
    (0, common_1.Post)('flux'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { storage: uploadStorage })),
    __param(0, (0, common_1.UploadedFile)(fileValidators)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.FluxUpscaleDto]),
    __metadata("design:returntype", Promise)
], UpscalerController.prototype, "upscaleFlux", null);
__decorate([
    (0, common_1.Post)('esrgan'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { storage: uploadStorage })),
    __param(0, (0, common_1.UploadedFile)(fileValidators)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.EsrganUpscaleDto]),
    __metadata("design:returntype", Promise)
], UpscalerController.prototype, "upscaleEsrgan", null);
__decorate([
    (0, common_1.Post)('imagen'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { storage: uploadStorage })),
    __param(0, (0, common_1.UploadedFile)(fileValidators)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.ImagenUpscaleDto]),
    __metadata("design:returntype", Promise)
], UpscalerController.prototype, "upscaleImagen", null);
__decorate([
    (0, common_1.Get)('status/:jobId'),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UpscalerController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Get)('result/:filename'),
    __param(0, (0, common_1.Param)('filename')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UpscalerController.prototype, "downloadResult", null);
exports.UpscalerController = UpscalerController = __decorate([
    (0, common_1.Controller)('api/upscale'),
    __metadata("design:paramtypes", [upscaler_service_1.UpscalerService])
], UpscalerController);
//# sourceMappingURL=upscaler.controller.js.map