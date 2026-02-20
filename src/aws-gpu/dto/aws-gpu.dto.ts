import { IsOptional, IsString, IsArray } from 'class-validator';

export class LaunchAwsInstanceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  instance_type?: string;
}

export class InstanceIdsDto {
  @IsArray()
  @IsString({ each: true })
  instance_ids: string[];
}

export class RestoreInstanceDto {
  @IsString()
  ami_id: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  instance_type?: string;
}
