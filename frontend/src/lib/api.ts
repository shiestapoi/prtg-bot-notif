import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type {
  NocGroup,
  NocMonitoredItem,
  NocHistory,
  NocRecipient,
  NocItemRecipient,
  MonitoringHistory,
  MonitoringSummaryItem,
  PrtgSetting,
  PrtgGroup,
  PrtgConfig,
  PrtgRecipient,
  PrtgSchedule,
} from './types';

// ─── Axios Instance ─────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
});

// ─── Response Interceptor (Error Handling) ──────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; statusCode?: number }>) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred';
    const statusCode = error.response?.status || 500;

    console.error(`[API Error] ${statusCode}: ${message}`);

    return Promise.reject(
      new Error(`${statusCode}: ${message}`),
    );
  },
);

// ─── Cookie Vault API (DEPRECATED — tidak dipakai lagi untuk auth PRTG) ─────
// cookieVaultApi dihapus dari frontend karena auth sekarang via username/passhash


// ─── PRTG Setting API ───────────────────────────────────────────────────────

export const prtgSettingApi = {
  get: () => api.get<PrtgSetting>('/api/prtg-setting').then((r) => r.data),

  update: (data: Partial<PrtgSetting>) =>
    api.patch<PrtgSetting>('/api/prtg-setting', data).then((r) => r.data),
};

// ─── NOC Groups API ─────────────────────────────────────────────────────────

export const nocGroupApi = {
  getAll: () => api.get<NocGroup[]>('/api/noc/groups').then((r) => r.data),

  getById: (id: number) =>
    api.get<NocGroup & { items: NocMonitoredItem[] }>(`/api/noc/groups/${id}`).then((r) => r.data),

  create: (data: { name: string; enabled?: boolean }) =>
    api.post<NocGroup>('/api/noc/groups', data).then((r) => r.data),

  update: (id: number, data: Partial<{ name: string; enabled: boolean }>) =>
    api.patch<NocGroup>(`/api/noc/groups/${id}`, data).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/api/noc/groups/${id}`).then((r) => r.data),
};

// ─── NOC Monitored Items API ────────────────────────────────────────────────

export const nocItemApi = {
  getAll: () =>
    api.get<NocMonitoredItem[]>('/api/noc/items').then((r) => r.data),

  getById: (id: number) =>
    api
      .get<NocMonitoredItem & { recipients: NocItemRecipient[] }>(`/api/noc/items/${id}`)
      .then((r) => r.data),

  create: (data: Partial<NocMonitoredItem> & { label: string; endpointUrl: string; groupId: number }) =>
    api.post<NocMonitoredItem>('/api/noc/items', data).then((r) => r.data),

  update: (id: number, data: Partial<NocMonitoredItem>) =>
    api.patch<NocMonitoredItem>(`/api/noc/items/${id}`, data).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/api/noc/items/${id}`).then((r) => r.data),

  assignRecipients: (id: number, recipientIds: number[]) =>
    api
      .post<NocItemRecipient[]>(`/api/noc/items/${id}/recipients`, { recipientIds })
      .then((r) => r.data),

  removeRecipient: (id: number, recipientId: number) =>
    api.delete(`/api/noc/items/${id}/recipients/${recipientId}`).then((r) => r.data),

  triggerPoll: (id: number) =>
    api.post(`/api/noc/items/${id}/poll`).then((r) => r.data),
};

// ─── NOC Recipients API ─────────────────────────────────────────────────────

export const nocRecipientApi = {
  getAll: () =>
    api.get<NocRecipient[]>('/api/noc/recipients').then((r) => r.data),

  create: (data: { phoneNumber: string; label?: string; targetType?: string; enabled?: boolean; groupId?: number | null }) =>
    api.post<NocRecipient>('/api/noc/recipients', data).then((r) => r.data),

  update: (id: number, data: Partial<NocRecipient>) =>
    api.patch<NocRecipient>(`/api/noc/recipients/${id}`, data).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/api/noc/recipients/${id}`).then((r) => r.data),
};

// ─── NOC History API ────────────────────────────────────────────────────────

export interface HistoryQueryParams {
  itemId?: number;
  from?: string;
  to?: string;
  status?: string;
}

export const nocHistoryApi = {
  query: (params?: HistoryQueryParams) =>
    api.get<{ data: NocHistory[]; total: number; limit: number; offset: number }>('/api/noc/history', { params }).then((r) => r.data.data),

  summary: () =>
    api.get<NocMonitoredItem[]>('/api/noc/history/summary').then((r) => r.data),
};

// ─── PRTG Report Groups API ─────────────────────────────────────────────────

export const prtgGroupApi = {
  getAll: () => api.get<PrtgGroup[]>('/api/prtg/groups').then((r) => r.data),

  create: (data: { name: string; enabled?: boolean }) =>
    api.post<PrtgGroup>('/api/prtg/groups', data).then((r) => r.data),

  update: (id: number, data: Partial<{ name: string; enabled: boolean }>) =>
    api.put<PrtgGroup>(`/api/prtg/groups/${id}`, data).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/api/prtg/groups/${id}`).then((r) => r.data),

  emergencyDisableAll: () =>
    api.post<{ disabled: number }>('/api/prtg/groups/emergency/disable-all').then((r) => r.data),

  emergencyEnableAll: () =>
    api.post<{ enabled: number }>('/api/prtg/groups/emergency/enable-all').then((r) => r.data),
};

// ─── PRTG Report Configs API ────────────────────────────────────────────────

export interface PrtgConfigPayload {
  title: string;
  sensorId: number;
  groupId: number;
  enabled?: boolean;
  monitoringEnabled?: boolean;
  pollingInterval?: number;
  thresholdLow?: number;
  thresholdHigh?: number;
  sensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
  cooldownInterval?: number;
  noTrafficCount?: number;
  flappingWindow?: number;
  flappingCount?: number;
  downCount?: number;
  rollingWindowSize?: number;
  notifyDown?: boolean;
  notifyNoTraffic?: boolean;
  notifyLowTraffic?: boolean;
  notifyFlapping?: boolean;
  notifyRecovery?: boolean;
}

export const prtgConfigApi = {
  getAll: () => api.get<PrtgConfig[]>('/api/prtg/configs').then((r) => r.data),

  create: (data: PrtgConfigPayload) =>
    api.post<PrtgConfig>('/api/prtg/configs', data).then((r) => r.data),

  update: (id: number, data: Partial<PrtgConfigPayload>) =>
    api.put<PrtgConfig>(`/api/prtg/configs/${id}`, data).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/api/prtg/configs/${id}`).then((r) => r.data),
};

// ─── PRTG Report Schedules API ──────────────────────────────────────────────

export const prtgScheduleApi = {
  getAll: () => api.get<PrtgSchedule[]>('/api/prtg/schedules').then((r) => r.data),

  create: (data: { name: string; groupId: number; cron: string; targetMode?: string; enabled?: boolean }) =>
    api.post<PrtgSchedule>('/api/prtg/schedules', data).then((r) => r.data),

  update: (id: number, data: Partial<{ name: string; groupId: number; cron: string; targetMode: string; enabled: boolean }>) =>
    api.put<PrtgSchedule>(`/api/prtg/schedules/${id}`, data).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/api/prtg/schedules/${id}`).then((r) => r.data),

  run: (id: number) =>
    api.post(`/api/prtg/schedules/${id}/run`).then((r) => r.data),
};

// ─── PRTG Report Recipients API ─────────────────────────────────────────────

export const prtgRecipientApi = {
  getAll: () => api.get<PrtgRecipient[]>('/api/prtg/recipients').then((r) => r.data),

  create: (data: { label: string; phoneNumber: string; targetType?: string; groupId: number; isAdmin?: boolean; enabled?: boolean }) =>
    api.post<PrtgRecipient>('/api/prtg/recipients', data).then((r) => r.data),

  update: (id: number, data: Partial<{ label: string; phoneNumber: string; targetType: string; groupId: number; isAdmin: boolean; enabled: boolean }>) =>
    api.put<PrtgRecipient>(`/api/prtg/recipients/${id}`, data).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/api/prtg/recipients/${id}`).then((r) => r.data),
};

// ─── WhatsApp Targets API ───────────────────────────────────────────────────

export interface WhatsappTarget {
  type: 'contact' | 'group' | 'channel' | 'manual';
  jid: string;
  label: string;
  description?: string | null;
}

export const whatsappApi = {
  getTargets: () =>
    api.get<WhatsappTarget[]>('/api/whatsapp/targets').then((r) => r.data),
};

// ─── Monitoring API (Unified) ───────────────────────────────────────────────

export interface MonitoringHistoryQueryParams {
  configId?: number;
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export const monitoringApi = {
  summary: () =>
    api.get<MonitoringSummaryItem[]>('/api/monitoring/summary').then((r) => r.data),

  history: (params?: MonitoringHistoryQueryParams) =>
    api.get<{ data: MonitoringHistory[]; total: number; limit: number; offset: number }>('/api/monitoring/history', { params }).then((r) => r.data),

  triggerPoll: (configId: number) =>
    api.post(`/api/monitoring/configs/${configId}/poll`).then((r) => r.data),

  forceNotify: (configId: number) =>
    api.post<{ message: string; configId: number; status: string }>(`/api/monitoring/configs/${configId}/notify`).then((r) => r.data),
};

// ─── Monitoring Recipients API ──────────────────────────────────────────────

export interface MonitoringRecipient {
  id: number;
  label: string | null;
  phoneNumber: string;
  targetType: string;
  enabled: boolean;
  groupId: number | null;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
}

export const monitoringRecipientApi = {
  getAll: () =>
    api.get<MonitoringRecipient[]>('/api/monitoring/recipients').then((r) => r.data),

  create: (data: { label?: string; phoneNumber: string; targetType?: string; groupId?: number; enabled?: boolean }) =>
    api.post<MonitoringRecipient>('/api/monitoring/recipients', data).then((r) => r.data),

  update: (id: number, data: Partial<{ label: string; phoneNumber: string; targetType: string; groupId: number | null; enabled: boolean }>) =>
    api.put<MonitoringRecipient>(`/api/monitoring/recipients/${id}`, data).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/api/monitoring/recipients/${id}`).then((r) => r.data),
};

// ─── Default Export ─────────────────────────────────────────────────────────

export default api;
