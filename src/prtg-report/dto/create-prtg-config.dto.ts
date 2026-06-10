import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { NocSensitivity } from '@prisma/client';

export class CreatePrtgConfigDto {
  @IsNotEmpty({ message: 'Title is required.' })
  @IsString()
  title: string;

  @IsInt()
  @Min(1, { message: 'Sensor ID must be at least 1.' })
  sensorId: number;

  @IsInt()
  groupId: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  cookieId?: number | null;

  // ─── Monitoring Fields (all optional) ───────────────────────────────────

  @IsOptional()
  @IsBoolean()
  monitoringEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(30, { message: 'Polling interval must be at least 30 seconds.' })
  pollingInterval?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Threshold low must be between 0 and 100.' })
  @Max(100, { message: 'Threshold low must be between 0 and 100.' })
  thresholdLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Threshold high must be between 0 and 100.' })
  @Max(100, { message: 'Threshold high must be between 0 and 100.' })
  thresholdHigh?: number;

  @IsOptional()
  @IsEnum(NocSensitivity, {
    message: 'Sensitivity must be LOW, MEDIUM, or HIGH.',
  })
  sensitivity?: NocSensitivity;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Cooldown interval must be >= 0.' })
  cooldownInterval?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'No traffic count must be >= 1.' })
  noTrafficCount?: number;

  @IsOptional()
  @IsInt()
  @Min(60, { message: 'Flapping window must be >= 60 seconds.' })
  flappingWindow?: number;

  @IsOptional()
  @IsInt()
  @Min(2, { message: 'Flapping count must be >= 2.' })
  flappingCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Down count must be >= 1.' })
  downCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Rolling window size must be between 1 and 100.' })
  @Max(100, { message: 'Rolling window size must be between 1 and 100.' })
  rollingWindowSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Down threshold must be >= 0.' })
  downThreshold?: number;

  @IsOptional()
  @IsBoolean()
  notifyDown?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyNoTraffic?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyLowTraffic?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyFlapping?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyRecovery?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenance?: boolean;

  @IsOptional()
  @IsString()
  maintenanceLabel?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0.1, { message: 'Min traffic threshold must be >= 0.1 Mbit/s.' })
  minTrafficThreshold?: number;
}
