import { IsOptional, IsNumber, IsString, IsBoolean, Min, Max } from 'class-validator';

export class EsrganUpscaleDto {
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
  @IsString()
  model?: string = '4x-UltraSharp.pth';

  @IsOptional()
  @IsNumber()
  tile_size?: number = 512;

  @IsOptional()
  @IsBoolean()
  use_fp16?: boolean = true;

  @IsOptional()
  @IsBoolean()
  use_two_pass?: boolean = false;

  @IsOptional()
  @IsString()
  output_format?: string = 'png';
}
