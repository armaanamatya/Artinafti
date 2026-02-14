import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';

export class FluxUpscaleDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8)
  upscale_factor?: number = 4;

  @IsOptional()
  @IsNumber()
  target_dpi?: number = 150;

  @IsOptional()
  @IsNumber()
  target_width_inches?: number;

  @IsOptional()
  @IsNumber()
  target_height_inches?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  denoise?: number = 0.2;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  steps?: number = 20;

  @IsOptional()
  @IsNumber()
  tile_size?: number = 512;

  @IsOptional()
  @IsString()
  upscale_model?: string = '4x-UltraSharp.pth';

  @IsOptional()
  @IsString()
  output_format?: string = 'png';

  @IsOptional()
  @IsString()
  positive_prompt?: string;

  @IsOptional()
  @IsNumber()
  guidance?: number = 3.5;

  @IsOptional()
  @IsNumber()
  seed?: number = 0;

  @IsOptional()
  @IsNumber()
  cfg?: number = 7;

  @IsOptional()
  @IsString()
  sampler_name?: string = 'euler';

  @IsOptional()
  @IsString()
  scheduler?: string = 'normal';
}
