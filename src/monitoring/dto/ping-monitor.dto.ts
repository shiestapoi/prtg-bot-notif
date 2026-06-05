import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdatePingMonitorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9.-]+$/, { message: 'host must be an IP address or hostname' })
  host?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  intervalSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  pingTimeoutSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  rtoThresholdSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  notificationCooldownSeconds?: number;

  @IsOptional()
  @IsBoolean()
  maintenance?: boolean;

  @IsOptional()
  @IsString()
  maintenanceLabel?: string | null;

  @IsOptional()
  @IsBoolean()
  notifyRecovery?: boolean;

  @IsOptional()
  @IsString()
  alertTemplate?: string;

  @IsOptional()
  @IsString()
  recoveryTemplate?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  recipientIds?: number[];
}

export class CreatePingMonitorDto extends UpdatePingMonitorDto {
  @IsString()
  declare name: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9.-]+$/, { message: 'host must be an IP address or hostname' })
  declare host: string;
}
