import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  Res,
  ParseFilePipe,
  FileTypeValidator,
  MaxFileSizeValidator,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpscalerService } from './upscaler.service';
import { FluxUpscaleDto, EsrganUpscaleDto, ImagenUpscaleDto } from './dto';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

const uploadStorage = diskStorage({
  destination: process.env.UPLOAD_DIR || './uploads',
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileValidators = new ParseFilePipe({
  validators: [
    new FileTypeValidator({ fileType: /image\/(png|jpe?g|webp)/ }),
    new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }), // 50MB
  ],
});

@Controller('api/upscale')
export class UpscalerController {
  constructor(private readonly upscalerService: UpscalerService) {}

  @Post('flux')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async upscaleFlux(
    @UploadedFile(fileValidators) file: Express.Multer.File,
    @Body() dto: FluxUpscaleDto,
  ) {
    return this.upscalerService.queueUpscale('flux', file.path, dto);
  }

  @Post('esrgan')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async upscaleEsrgan(
    @UploadedFile(fileValidators) file: Express.Multer.File,
    @Body() dto: EsrganUpscaleDto,
  ) {
    return this.upscalerService.queueUpscale('esrgan', file.path, dto);
  }

  @Post('imagen')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async upscaleImagen(
    @UploadedFile(fileValidators) file: Express.Multer.File,
    @Body() dto: ImagenUpscaleDto,
  ) {
    return this.upscalerService.queueUpscale('imagen', file.path, dto);
  }

  @Get('status/:jobId')
  async getStatus(@Param('jobId') jobId: string) {
    return this.upscalerService.getJobStatus(jobId);
  }

  @Get('result/:filename')
  async downloadResult(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.upscalerService.getResultPath(filename);
      res.sendFile(filePath);
    } catch {
      throw new NotFoundException('Result file not found');
    }
  }
}
