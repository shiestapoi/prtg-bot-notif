export type WhatsappConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'qr_ready'
  | 'logged_out'
  | 'error';

export interface DisconnectSnapshot {
  code?: number;
  message?: string;
  at: string;
}

export interface WhatsappRuntimeState {
  sessionName: string;
  status: WhatsappConnectionStatus;
  qr: string | null;
  qrDataUrl: string | null;
  isNewLogin: boolean;
  receivedPendingNotifications: boolean;
  me: {
    id?: string;
    name?: string;
  } | null;
  lastDisconnect: DisconnectSnapshot | null;
}

export type WhatsappTargetType = 'contact' | 'group' | 'channel' | 'manual';

export interface WhatsappTargetOption {
  type: WhatsappTargetType;
  jid: string;
  label: string;
  description?: string | null;
}

export interface WhatsappStatusResponse extends WhatsappRuntimeState {
  isConnected: boolean;
  hasQr: boolean;
}

export interface WhatsappHealthResponse {
  service: 'whatsapp';
  healthy: boolean;
  sessionName: string;
  status: WhatsappConnectionStatus;
  isConnected: boolean;
  hasQr: boolean;
  lastDisconnectAt: string | null;
  detail: string;
}

export interface WhatsappServiceAvailabilityResponse {
  service: 'whatsapp';
  enabled: boolean;
  detail: string;
}
