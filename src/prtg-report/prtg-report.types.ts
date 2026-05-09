export interface PrtgGroupDto {
  id: number;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgConfigDto {
  id: number;
  title: string;
  sensorId: number;
  groupId: number;
  groupName: string;
  groupEnabled: boolean;
  enabled: boolean;
  cookieId: number | null;
  // Monitoring fields
  monitoringEnabled: boolean;
  pollingInterval: number;
  thresholdLow: number;
  thresholdHigh: number;
  sensitivity: string;
  cooldownInterval: number;
  noTrafficCount: number;
  flappingWindow: number;
  flappingCount: number;
  downCount: number;
  rollingWindowSize: number;
  notifyDown: boolean;
  notifyNoTraffic: boolean;
  notifyLowTraffic: boolean;
  notifyFlapping: boolean;
  notifyRecovery: boolean;
  lastPolledAt: string | null;
  lastStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgCookieDto {
  id: number;
  label: string | null;
  value: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgRecipientDto {
  id: number;
  label: string | null;
  phoneNumber: string;
  targetType: 'contact' | 'group' | 'channel' | 'manual';
  enabled: boolean;
  isAdmin: boolean;
  groupId: number | null;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgScheduleDto {
  id: number;
  name: string;
  groupId: number | null;
  groupName: string | null;
  cron: string;
  targetMode: 'all' | 'group_only' | 'personal_only';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchSummary {
  groupName: string;
  sentConfigs: number;
  sentRecipients: number;
}

export interface ScheduleDispatchSummary {
  scheduleId: number;
  scheduleName: string;
  groupName: string | null;
  targetMode: 'all' | 'group_only' | 'personal_only';
  result: DispatchSummary;
}
