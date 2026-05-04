import type { WAMessage } from 'baileys';

export function resolveIncomingChatJid(message: WAMessage): string | null {
  return message.key.remoteJid ?? null;
}

export function isIncomingMessage(message: WAMessage, remoteJid: string | null): boolean {
  if (!remoteJid) {
    return false;
  }

  if (message.key.fromMe) {
    return false;
  }

  if (!message.message) {
    return false;
  }

  return true;
}
