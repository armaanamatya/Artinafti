"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpscalerModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const upscaler_controller_1 = require("./upscaler.controller");
const upscaler_service_1 = require("./upscaler.service");
const upscaler_processor_1 = require("./processors/upscaler.processor");
const python_module_1 = require("../python/python.module");
const isLocalMode = process.env.LOCAL_MODE === 'true';
const optionalImports = [];
const optionalProviders = [];
if (!isLocalMode) {
    optionalImports.push(bullmq_1.BullModule.registerQueue({ name: 'upscaler' }));
    optionalProviders.push(upscaler_processor_1.UpscalerProcessor);
}
let UpscalerModule = class UpscalerModule {
};
exports.UpscalerModule = UpscalerModule;
exports.UpscalerModule = UpscalerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            ...optionalImports,
            python_module_1.PythonModule,
        ],
        controllers: [upscaler_controller_1.UpscalerController],
        providers: [upscaler_service_1.UpscalerService, ...optionalProviders],
    })
], UpscalerModule);
//# sourceMappingURL=upscaler.module.js.map