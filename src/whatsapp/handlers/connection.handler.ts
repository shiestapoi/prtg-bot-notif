/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unused-vars */
import type { Logger } from '@nestjs/common';
import type { ConnectionState, WASocket } from 'baileys';
import { DisconnectReason } from 'baileys';
import QRCode from 'qrcode';
import type { WhatsappRuntimeState } from '../whatsapp.types';

export interface ConnectionUpdateHandlerParams {
  sessionName: string;
  socket: WASocket;
  update: Partial<ConnectionState>;
  runtimeState: WhatsappRuntimeState;
  logger: Logger;
  isRegistered: boolean;
  onReconnect: () => void;
  onLoggedOut?: () => void;
  onAuthReset?: () => void;
  onQr?: (qr: string) => void;
  onStatusChange?: () => void;
}

export async function handleConnectionUpdate({
  sessionName,
  socket,
  update,
  runtimeState,
  logger,
  isRegistered,
  onReconnect,
  onLoggedOut,
  onAuthReset,
  onQr,
  onStatusChange,
}: ConnectionUpdateHandlerParams): Promise<void> {
  const {
    connection,
    lastDisconnect,
    qr,
    isNewLogin,
    receivedPendingNotifications,
  } = update;
  const emitStatus = () => onStatusChange?.();

  if (typeof isNewLogin === 'boolean') {
    runtimeState.isNewLogin = isNewLogin;
  }

  if (typeof receivedPendingNotifications === 'boolean') {
    runtimeState.receivedPendingNotifications = receivedPendingNotifications;
  }

  if (qr && qr !== runtimeState.qr) {
    runtimeState.qr = qr;
    runtimeState.qrDataUrl = await QRCode.toDataURL(qr, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 8,
      type: 'image/png',
    });
    runtimeState.status = 'qr_ready';
    logger.log(`QR ready for session ${sessionName}. Scan it from WhatsApp.`);
    onQr?.(qr);
    emitStatus();
  }

  if (connection === 'connecting') {
    runtimeState.status = 'connecting';
    logger.log(`WhatsApp session ${sessionName} is connecting...`);
    emitStatus();
    return;
  }

  if (connection === 'open') {
    runtimeState.status = 'open';
    runtimeState.qr = null;
    runtimeState.qrDataUrl = null;
    runtimeState.lastDisconnect = null;
    runtimeState.me = socket.user
      ? {
          id: socket.user.id,
          name: socket.user.name,
        }
      : null;

    logger.log(`WhatsApp session ${sessionName} connected successfully.`);
    emitStatus();
    return;
  }

  if (connection === 'close') {
    const error = lastDisconnect?.error as
      | { output?: { statusCode?: number } }
      | undefined;
    const disconnectCode = error?.output?.statusCode;
    const shouldReconnect = disconnectCode !== DisconnectReason.loggedOut;

    runtimeState.lastDisconnect = {
      code: disconnectCode,
      message: lastDisconnect?.error?.message,
      at: lastDisconnect?.date?.toISOString() ?? new Date().toISOString(),
    };
    runtimeState.status = shouldReconnect ? 'connecting' : 'logged_out';
    runtimeState.me = null;

    if (!isRegistered && disconnectCode === 405) {
      runtimeState.status = 'error';
      logger.warn(
        `WhatsApp session ${sessionName} registration was rejected by WhatsApp with code 405. Stop retrying to avoid an endless registration loop.`,
      );
      emitStatus();
      return;
    }

    if (!shouldReconnect) {
      logger.warn(`WhatsApp session ${sessionName} logged out.`);
      onLoggedOut?.();
      emitStatus();
      return;
    }

    logger.warn(
      `WhatsApp session ${sessionName} disconnected. Reconnecting in 5 seconds...`,
    );
    onReconnect();
    emitStatus();
  }
}
