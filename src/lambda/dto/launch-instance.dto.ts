import { IsOptional, IsString, IsArray } from 'class-validator';

export class LaunchInstanceDto {
  @IsString()
  instance_type_name: string;

  @IsString()
  region_name: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ssh_key_names?: string[];

  @IsOptional()
  @IsString()
  name?: string;
}

export class TerminateInstanceDto {
  @IsArray()
  @IsString({ each: true })
  instance_ids: string[];
}
