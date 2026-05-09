import {
  Injectable,
  Inject,
  Logger,
  forwardRef,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import makeWASocket, {
  Browsers,
  fetchLatestWaWebVersion,
  type SignalKeyStore,
  type WASocket,
  type WAVersion,
} from 'baileys';
import type { KeyvBaileysAuthState } from './auth/whatsapp-auth';
import { clearAuthState, createAuthState } from './auth/whatsapp-auth';
import { handleConnectionUpdate } from './handlers/connection.handler';
import { handleMessagesUpsert } from './handlers/messages-upsert.handler';
import { PrtgReportService } from '../prtg-report/prtg-report.service';
import { helloPlugin } from './plugins/hello.plugin';
import { HelpPlugin } from './plugins/help.plugin';
import { pingPlugin } from './plugins/ping.plugin';
import { PrtgAdminPlugin } from './plugins/prtg-admin.plugin';
import { PrtgGroupPlugin } from './plugins/prtg-group.plugin';
import { StatusPlugin } from './plugins/status.plugin';
import { WhatsappRealtimeService } from './whatsapp-realtime.service';
import { WhatsappSocketStore } from './whatsapp-socket.store';
import type {
  WhatsappTargetOption,
  WhatsappHealthResponse,
  WhatsappRuntimeState,
  WhatsappServiceAvailabilityResponse,
  WhatsappStatusResponse,
} from './whatsapp.types';

function getBooleanEnv(name: string, defaultValue: boolean) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(rawValue.trim().toLowerCase());
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly sessionName = 'haruyaki';
  private socket: WASocket | null = null;
  private authState: KeyvBaileysAuthState | null = null;
  private socketVersion: WAVersion | null = null;
  private readonly targets = new Map<string, WhatsappTargetOption>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private runtimeState: WhatsappRuntimeState = {
    sessionName: this.sessionName,
    status: 'idle',
    qr: null,
    qrDataUrl: null,
    isNewLogin: false,
    receivedPendingNotifications: false,
    me: null,
    lastDisconnect: null,
  };
  private readonly sendReceiptEnabled = getBooleanEnv(
    'WHATSAPP_MESSAGE_SEND_RECEIPT',
    false,
  );
  private readonly printQrInTerminal = getBooleanEnv(
    'WHATSAPP_PRINT_QR',
    false,
  );
  private readonly serviceEnabled = getBooleanEnv(
    'WHATSAPP_SERVICE_ENABLED',
    true,
  );
  private readonly useLatestWaWebVersion = getBooleanEnv(
    'WHATSAPP_USE_LATEST_WA_WEB_VERSION',
    true,
  );

  constructor(
    private readonly realtime: WhatsappRealtimeService,
    private readonly socketStore: WhatsappSocketStore,
    private readonly helpPlugin: HelpPlugin,
    private readonly statusPlugin: StatusPlugin,
    private readonly prtgAdminPlugin: PrtgAdminPlugin,
    private readonly prtgGroupPlugin: PrtgGroupPlugin,
    @Inject(forwardRef(() => PrtgReportService))
    private readonly prtgService: PrtgReportService,
  ) {}

  async onModuleInit() {
    if (!this.serviceEnabled) {
      this.logger.warn(
        'WhatsApp service is disabled by WHATSAPP_SERVICE_ENABLED.',
      );
      return;
    }

    await this.loadTargetsFromFile();
    await this.startSession();
    this.realtime.publish(this.getStatus());
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.socket) {
      this.socket.end(
        new Error(
          `NestJS application shutdown for session ${this.sessionName}`,
        ),
      );
    }

    this.reconnectTimer = null;
    this.socket = null;
  }

  async startSession() {
    this.clearReconnectTimer();
    this.endSessionSocket(`Restarting WhatsApp session ${this.sessionName}`);

    const runtimeState = this.getRuntimeState();
    runtimeState.status = 'connecting';
    runtimeState.qr = null;
    runtimeState.qrDataUrl = null;
    runtimeState.lastDisconnect = null;
    runtimeState.isNewLogin = false;
    runtimeState.receivedPendingNotifications = false;
    this.realtime.publish(this.getStatus());

    const authState = await createAuthState(this.sessionName);
    this.authState = authState;
    const isRegistered = Boolean(authState.state.creds.registered);
    const version = await this.getSocketVersion();

    const socket = makeWASocket({
      auth: {
        creds: authState.state.creds,
        keys: authState.state.keys as SignalKeyStore,
      },
      version,
      printQRInTerminal: this.printQrInTerminal,
      browser: Browsers.ubuntu('PRTG BOT'),
    });

    this.socket = socket;
    this.socketStore.setSocket(socket);

    socket.ev.on('creds.update', () => {
      void Promise.resolve(authState.saveCreds()).catch((error: unknown) => {
        this.logger.error(
          `Failed to save WhatsApp credentials: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    });
    socket.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        this.upsertContactTarget({
          id: contact.phoneNumber || contact.id,
          label: contact.name || contact.notify || contact.verifiedName,
        });
      }
    });
    socket.ev.on('contacts.update', (contacts) => {
      for (const contact of contacts) {
        this.upsertContactTarget({
          id: contact.phoneNumber || contact.id,
          label: contact.name || contact.notify || contact.verifiedName,
        });
      }
    });
    socket.ev.on('messaging-history.set', ({ contacts, chats }) => {
      for (const contact of contacts) {
        this.upsertContactTarget({
          id: contact.phoneNumber || contact.id,
          label: contact.name || contact.notify || contact.verifiedName,
        });
      }
      // messaging-history also provides group chat metadata
      for (const chat of chats ?? []) {
        if (chat.id?.endsWith('@g.us')) {
          const existing = this.targets.get(chat.id);
          if (!existing) {
            this.targets.set(chat.id, {
              type: 'group',
              jid: chat.id,
              label: chat.name || chat.id,
              description: chat.id,
            });
          }
        }
      }
      void this.saveTargetsToFile();
    });
    socket.ev.on('groups.upsert', (groups) => {
      for (const group of groups) {
        this.targets.set(group.id, {
          type: 'group',
          jid: group.id,
          label: group.subject || group.id,
          description: `${group.participants?.length ?? 0} participants`,
        });
      }
      void this.saveTargetsToFile();
    });
    socket.ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (!update.id) continue;
        const existing = this.targets.get(update.id);
        if (existing && update.subject) {
          this.targets.set(update.id, {
            ...existing,
            label: update.subject,
          });
        }
      }
      void this.saveTargetsToFile();
    });
    socket.ev.on('connection.update', (update) => {
      void handleConnectionUpdate({
        sessionName: this.sessionName,
        socket,
        update,
        runtimeState,
        logger: this.logger,
        isRegistered,
        onReconnect: () => this.scheduleReconnect(),
        onLoggedOut: () => {
          void this.handleLoggedOut();
        },
        onAuthReset: () => {
          void this.handleAuthReset();
        },
        onStatusChange: () => this.realtime.publish(this.getStatus()),
      });
    });

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      const plugins = [
        this.helpPlugin,
        this.statusPlugin,
        this.prtgAdminPlugin,
        helloPlugin,
        pingPlugin,
        this.prtgGroupPlugin,
      ];
      void handleMessagesUpsert({
        logger: this.logger,
        socket,
        sessionName: this.sessionName,
        messages,
        type,
        plugins,
        sendReceipt: this.sendReceiptEnabled,
        isCommandAuthorized: (senderJids, isFromMe) =>
          this.prtgService.isAuthorizedWhatsappCommander(senderJids, isFromMe),
      });
    });

    this.realtime.publish(this.getStatus());
  }

  async logout() {
    if (!this.socket) {
      throw new Error('WhatsApp socket is not connected.');
    }

    try {
      await this.socket.logout();
    } catch (error) {
      this.logger.warn(
        `Error during WhatsApp logout: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // handleLoggedOut will be triggered by the connection.update event,
    // but we also call it explicitly in case the event doesn't fire
    await this.handleLoggedOut();
  }

  isServiceEnabled() {
    return this.serviceEnabled;
  }

  getServiceUnavailableResponse(): WhatsappServiceAvailabilityResponse {
    return {
      service: 'whatsapp',
      enabled: false,
      detail: 'WhatsApp service is disabled by WHATSAPP_SERVICE_ENABLED.',
    };
  }

  getStatus(): WhatsappStatusResponse {
    const runtimeState = this.getRuntimeState();
    const isConnected = runtimeState.status === 'open';

    return {
      ...runtimeState,
      isConnected,
      hasQr: Boolean(runtimeState.qr),
    };
  }

  getHealth(): WhatsappHealthResponse {
    const runtimeState = this.getRuntimeState();
    const isConnected = runtimeState.status === 'open';
    const isRecovering =
      runtimeState.status === 'connecting' ||
      runtimeState.status === 'qr_ready';

    let detail = 'WhatsApp session is not connected.';
    if (isConnected) {
      detail = 'WhatsApp session is connected.';
    } else if (runtimeState.status === 'qr_ready') {
      detail = 'QR code is ready. Scan to login.';
    } else if (runtimeState.status === 'connecting') {
      detail = 'WhatsApp session is connecting.';
    } else if (runtimeState.status === 'logged_out') {
      detail = 'WhatsApp session logged out.';
    }

    return {
      service: 'whatsapp',
      healthy: isConnected || isRecovering,
      sessionName: runtimeState.sessionName,
      status: runtimeState.status,
      isConnected,
      hasQr: Boolean(runtimeState.qr),
      lastDisconnectAt: runtimeState.lastDisconnect?.at ?? null,
      detail,
    };
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();

    const timer = setTimeout(() => {
      void this.startSession();
    }, 5000);

    this.reconnectTimer = timer;
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private endSessionSocket(reason: string) {
    if (!this.socket) {
      return;
    }

    this.socket.end(new Error(reason));
    this.socket = null;
    this.socketStore.setSocket(null);
  }

  private async handleLoggedOut() {
    this.endSessionSocket(`WhatsApp session ${this.sessionName} logged out`);
    await this.authState?.clearState();
    this.authState = null;

    // Clear targets cache because the user logged out (prevent leaking old contacts)
    this.targets.clear();
    await this.saveTargetsToFile().catch(() => {});

    this.realtime.publish(this.getStatus());

    // Start a new session immediately so the user can scan a new QR code
    this.scheduleReconnect();
  }

  private async handleAuthReset() {
    this.endSessionSocket(
      `Resetting WhatsApp auth state for session ${this.sessionName}`,
    );
    await clearAuthState(this.sessionName);
    this.realtime.publish(this.getStatus());
    this.scheduleReconnect();
  }

  async listTargets(): Promise<WhatsappTargetOption[]> {
    const socket = this.socketStore.getSocket();
    const hasGroups = Array.from(this.targets.values()).some(
      (t) => t.type === 'group',
    );

    // If we are connected and have no cached groups yet, fetch them live once
    if (socket && this.getRuntimeState().status === 'open' && !hasGroups) {
      try {
        const participatingGroups = await socket.groupFetchAllParticipating();
        for (const group of Object.values(participatingGroups)) {
          this.targets.set(group.id, {
            type: 'group' as const,
            jid: group.id,
            label: group.subject || group.id,
            description: `${group.participants?.length ?? 0} participants`,
          });
        }
        void this.saveTargetsToFile();
      } catch (error) {
        this.logger.warn(
          `Unable to fetch WhatsApp groups: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return Array.from(this.targets.values())
      .map((target) => ({
        ...target,
        label:
          target.type === 'contact'
            ? this.getContactLabel(target.jid, target.label)
            : target.label,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async getChannelTarget(key: string): Promise<WhatsappTargetOption> {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }

    const normalizedKey = key.trim();
    const lookupType = normalizedKey.endsWith('@newsletter') ? 'jid' : 'invite';
    const metadata = await socket.newsletterMetadata(lookupType, normalizedKey);
    if (!metadata) {
      throw new Error('WhatsApp channel metadata not found.');
    }

    const jid = metadata.id.endsWith('@newsletter')
      ? metadata.id
      : `${metadata.id}@newsletter`;
    const target = {
      type: 'channel' as const,
      jid,
      label: metadata.name || jid,
      description:
        typeof metadata.subscribers === 'number'
          ? `${metadata.subscribers} subscribers`
          : (metadata.description ?? null),
    };

    this.targets.set(jid, target);
    void this.saveTargetsToFile();

    return target;
  }

  private async getSocketVersion() {
    if (!this.useLatestWaWebVersion) {
      return undefined;
    }

    if (this.socketVersion) {
      return this.socketVersion;
    }

    const result = await fetchLatestWaWebVersion();
    if (!result.isLatest) {
      this.logger.warn(
        `Unable to fetch latest WhatsApp Web version. Using Baileys default version. ${String(
          result.error,
        )}`,
      );
      return undefined;
    }

    this.socketVersion = result.version;
    this.logger.log(`Using WhatsApp Web version ${result.version.join('.')}.`);
    return this.socketVersion;
  }

  private async loadTargetsFromFile() {
    try {
      const filePath = path.join(
        process.cwd(),
        'storage',
        'whatsapp-targets.json',
      );
      const data = await fs.readFile(filePath, 'utf-8');
      const targetsData = JSON.parse(data) as WhatsappTargetOption[];
      for (const target of targetsData) {
        if (target && target.jid) {
          this.targets.set(target.jid, target);
        }
      }
      this.logger.log(`Loaded ${this.targets.size} targets from storage.`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.warn(
          `Failed to load targets from storage: ${error.message}`,
        );
      }
    }
  }

  private async saveTargetsToFile() {
    try {
      const storageDir = path.join(process.cwd(), 'storage');
      await fs.mkdir(storageDir, { recursive: true });
      const filePath = path.join(storageDir, 'whatsapp-targets.json');
      const targetsData = Array.from(this.targets.values());
      await fs.writeFile(
        filePath,
        JSON.stringify(targetsData, null, 2),
        'utf-8',
      );
    } catch (error: any) {
      this.logger.warn(`Failed to save targets to storage: ${error.message}`);
    }
  }

  private upsertContactTarget(
    contact: { id?: string; label?: string },
    save = true,
  ) {
    if (!contact.id) {
      return;
    }

    const jid = contact.id.includes('@')
      ? contact.id
      : `${contact.id}@s.whatsapp.net`;
    if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) {
      return;
    }

    const existing = this.targets.get(jid);
    const label = this.getContactLabel(jid, contact.label || existing?.label);
    this.targets.set(jid, {
      type: 'contact',
      jid,
      label,
      description: jid,
    });

    if (save) {
      this.saveTargetsToFile().catch(() => {});
    }
  }

  private getContactLabel(jid: string, label?: string | null) {
    const trimmed = label?.trim();
    if (trimmed) {
      return trimmed;
    }

    const bare = jid.split('@')[0] || jid;
    return bare.replace(/[^0-9A-Za-z]/g, '') || jid;
  }

  private getRuntimeState(): WhatsappRuntimeState {
    return this.runtimeState;
  }
}
