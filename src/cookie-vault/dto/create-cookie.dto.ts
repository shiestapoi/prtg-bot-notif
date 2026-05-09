import { IsBoolean, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateCookieDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsNotEmpty({ message: 'cookie value is required.' })
  @IsString()
  value: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
