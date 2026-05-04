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
  requestUrl: string;
  groupId: number;
  groupName: string;
  groupEnabled: boolean;
  enabled: boolean;
  cookieId: number | null;
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

export interface PrtgSettingDto {
  loginUrl: string;
  loginUsername: string | null;
  hasLoginPassword: boolean;
  messageTemplate: string;
  privateMessageTemplate: string;
  groupMessageTemplate: string;
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
