// ─── Enums / Union Types ────────────────────────────────────────────────────

export type NocStatus =
  | 'NORMAL'
  | 'LOW_TRAFFIC'
  | 'NO_TRAFFIC'
  | 'HIGH_UTILIZATION'
  | 'POSSIBLE_FLAPPING'
  | 'DOWN';

export type NocSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

export type RecipientTargetType = 'contact' | 'group' | 'channel' | 'manual';

// ─── NOC Entities ───────────────────────────────────────────────────────────

export interface NocGroup {
  id: number;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
}

export interface NocMonitoredItem {
  id: number;
  label: string;
  endpointUrl: string;
  groupId: number;
  enabled: boolean;
  pollingInterval: number;
  thresholdLow: number;
  thresholdHigh: number;
  noTrafficCount: number;
  flappingWindow: number;
  flappingCount: number;
  downCount: number;
  sensitivity: NocSensitivity;
  cooldownInterval: number;
  rollingWindowSize: number;
  lastPolledAt: string | null;
  lastStatus: NocStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NocHistory {
  id: number;
  monitoredItemId: number;
  timestamp: string;
  status: NocStatus;
  totalTrafficBytes: number | null;
  totalTrafficBitrate: number | null;
  inboundBytes: number | null;
  inboundBitrate: number | null;
  outboundBytes: number | null;
  outboundBitrate: number | null;
  errorPercent: number | null;
  coveragePercent: number | null;
  rawInboundBitrate: number | null;
  rawOutboundBitrate: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface NocRecipient {
  id: number;
  label: string | null;
  phoneNumber: string;
  targetType: RecipientTargetType;
  enabled: boolean;
  groupId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NocItemRecipient {
  id: number;
  monitoredItemId: number;
  recipientId: number;
  createdAt: string;
}

// ─── PRTG Report Entities ───────────────────────────────────────────────────

export interface PrtgGroup {
  id: number;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgConfig {
  id: number;
  title: string;
  sensorId: number;
  groupId: number;
  enabled: boolean;
  cookieId: number;
  // Monitoring fields
  monitoringEnabled: boolean;
  pollingInterval: number;
  thresholdLow: number;
  thresholdHigh: number;
  sensitivity: NocSensitivity;
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
  lastStatus: NocStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgRecipient {
  id: number;
  label: string;
  phoneNumber: string;
  targetType: RecipientTargetType;
  enabled: boolean;
  isAdmin: boolean;
  groupId: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgSchedule {
  id: number;
  name: string;
  groupId: number;
  cron: string;
  targetMode: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgCookie {
  id: number;
  label: string;
  value: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrtgSetting {
  loginUrl: string;
  loginUsername: string;
  hasLoginPassword: boolean;
  messageTemplate: string;
  alertMessageTemplate: string;
  recoveryMessageTemplate: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Normalized Metric ──────────────────────────────────────────────────────

export interface NormalizedMetric {
  timestamp: string;
  totalTrafficBytes: number | null;
  totalTrafficBitrate: number | null;
  inboundBytes: number | null;
  inboundBitrate: number | null;
  outboundBytes: number | null;
  outboundBitrate: number | null;
  errorPercent: number | null;
  coveragePercent: number | null;
}

// ─── SSE Event ──────────────────────────────────────────────────────────────

export interface NocStatusEvent {
  type: string;
  itemId: number;
  label: string;
  previousStatus: NocStatus;
  currentStatus: NocStatus;
  timestamp: string;
  metric: Partial<NormalizedMetric>;
}

// ─── Monitoring SSE Event (Unified) ─────────────────────────────────────────

export interface MonitoringStatusEvent {
  type: 'status_change';
  configId: number;
  configTitle: string;
  groupName: string;
  previousStatus: NocStatus;
  currentStatus: NocStatus;
  timestamp: string;
  metric: {
    totalTrafficBitrate: number | null;
    inboundBitrate: number | null;
    outboundBitrate: number | null;
  } | null;
}

// ─── Monitoring History (Unified) ───────────────────────────────────────────

export interface MonitoringHistory {
  id: number;
  configId: number;
  timestamp: string;
  status: NocStatus;
  totalTrafficBytes: number | null;
  totalTrafficBitrate: number | null;
  inboundBytes: number | null;
  inboundBitrate: number | null;
  outboundBytes: number | null;
  outboundBitrate: number | null;
  errorPercent: number | null;
  coveragePercent: number | null;
  rawInboundBitrate: number | null;
  rawOutboundBitrate: number | null;
  errorMessage: string | null;
  rawResponse: string | null;
  createdAt: string;
}

export interface MonitoringSummaryItem {
  configId: number;
  title: string;
  groupName: string;
  sensorId: number;
  lastStatus: NocStatus;
  lastPolledAt: string | null;
  lastMetric: {
    totalTrafficBitrate: number | null;
    inboundBitrate: number | null;
    outboundBitrate: number | null;
  } | null;
}

// ─── Monitoring Summary ─────────────────────────────────────────────────────

export interface MonitoringSummaryItem {
  configId: number;
  title: string;
  groupName: string;
  sensorId: number;
  lastStatus: NocStatus;
  lastPolledAt: string | null;
  lastMetric: {
    totalTrafficBitrate: number | null;
    inboundBitrate: number | null;
    outboundBitrate: number | null;
  } | null;
}
