// ─── Enums / Union Types ────────────────────────────────────────────────────

export type NocStatus =
  | 'NORMAL'
  | 'LOW_TRAFFIC'
  | 'NO_TRAFFIC'
  | 'HIGH_UTILIZATION'
  | 'POSSIBLE_FLAPPING'
  | 'DOWN'
  | 'MAINTENANCE';

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
  downThreshold: number;
  notifyDown: boolean;
  notifyNoTraffic: boolean;
  notifyLowTraffic: boolean;
  notifyFlapping: boolean;
  notifyRecovery: boolean;
  maintenance: boolean;
  maintenanceLabel: string | null;
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

export interface ReceiptSchedule {
  id: number;
  name: string;
  groupId: number | null;
  group?: NocGroup | null;
  cron: string;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  includeDown: boolean;
  includeLowTraffic: boolean;
  includeLink: boolean;
  targetMode: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptRecipient {
  id: number;
  label: string | null;
  phoneNumber: string;
  targetType: RecipientTargetType;
  enabled: boolean;
  groupId: number | null;
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
  tvUIVersion: string;
  reportUIVersion: string;
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
  maintenance: boolean;
  metric: {
    totalTrafficBitrate: number | null;
    inboundBitrate: number | null;
    outboundBitrate: number | null;
  } | null;
}

export interface ConfigUpdatedEvent {
  type: 'config_updated';
  action: 'created' | 'updated' | 'deleted';
  configId: number;
  timestamp: string;
}

export type MonitoringEvent = MonitoringStatusEvent | ConfigUpdatedEvent | PingStatusEvent | PingLogEvent;

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
  downCountToday: number;
  downCountMonth: number;
  maintenance: boolean;
  maintenanceLabel: string | null;
  lastMetric: {
    totalTrafficBitrate: number | null;
    inboundBitrate: number | null;
    outboundBitrate: number | null;
  } | null;
}

export type PingMonitorStatus = 'UNKNOWN' | 'UP' | 'RTO';

export interface PingMonitor {
  id: number;
  name: string;
  host: string;
  enabled: boolean;
  intervalSeconds: number;
  pingTimeoutSeconds: number;
  rtoThresholdSeconds: number;
  notificationCooldownSeconds: number;
  maintenance: boolean;
  maintenanceLabel: string | null;
  notifyRecovery: boolean;
  alertTemplate: string;
  recoveryTemplate: string;
  status: PingMonitorStatus;
  lastLatencyMs: number | null;
  lastCheckedAt: string | null;
  outageStartedAt: string | null;
  lastAlertAt: string | null;
  recipientIds: number[];
}

export interface PingStatusEvent {
  type: 'ping_status';
  monitorId: number;
  name: string;
  host: string;
  status: PingMonitorStatus;
  latencyMs: number | null;
  checkedAt: string;
  outageStartedAt: string | null;
  maintenance: boolean;
  maintenanceLabel: string | null;
}

export interface PingLogEvent {
  type: 'ping_log';
  timestamp: string;
  name: string;
  host: string;
  status: 'UP' | 'RTO';
  latencyMs: string;
}
