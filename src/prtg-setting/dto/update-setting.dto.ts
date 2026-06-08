import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateSettingDto {
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  loginUrl?: string;

  @IsOptional()
  @IsString()
  loginUsername?: string | null;

  @IsOptional()
  @IsString()
  loginPassword?: string | null;

  @IsOptional()
  @IsString()
  messageTemplate?: string;

  @IsOptional()
  @IsString()
  alertMessageTemplate?: string;

  @IsOptional()
  @IsString()
  recoveryMessageTemplate?: string;

  @IsOptional()
  @IsString()
  tvUIVersion?: string;

  @IsOptional()
  @IsString()
  reportUIVersion?: string;
}
