import { UpscalerService } from './upscaler.service';
import { FluxUpscaleDto, EsrganUpscaleDto, ImagenUpscaleDto } from './dto';
import { Response } from 'express';
export declare class UpscalerController {
    private readonly upscalerService;
    constructor(upscalerService: UpscalerService);
    upscaleFlux(file: Express.Multer.File, dto: FluxUpscaleDto): Promise<{
        jobId: string;
        status: string;
        method: "flux" | "esrgan" | "imagen";
    }>;
    upscaleEsrgan(file: Express.Multer.File, dto: EsrganUpscaleDto): Promise<{
        jobId: string;
        status: string;
        method: "flux" | "esrgan" | "imagen";
    }>;
    upscaleImagen(file: Express.Multer.File, dto: ImagenUpscaleDto): Promise<{
        jobId: string;
        status: string;
        method: "flux" | "esrgan" | "imagen";
    }>;
    getStatus(jobId: string): Promise<any>;
    downloadResult(filename: string, res: Response): Promise<void>;
}
