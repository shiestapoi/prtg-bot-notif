import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCookieDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
