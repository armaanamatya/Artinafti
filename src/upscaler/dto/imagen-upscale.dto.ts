import { IsOptional, IsNumber, IsString } from 'class-validator';

export class ImagenUpscaleDto {
  @IsOptional()
  @IsString()
  upscale_factor?: string = 'x4';

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
  gcp_project_id?: string;

  @IsOptional()
  @IsString()
  gcp_region?: string;

  @IsOptional()
  @IsString()
  output_format?: string = 'png';

  @IsOptional()
  @IsString()
  prompt?: string;
}
