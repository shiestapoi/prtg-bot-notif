import type { WAMessage } from 'baileys';

export function extractMessageText(message: WAMessage): string | null {
  return (
    message.message?.conversation ??
    message.message?.extendedTextMessage?.text ??
    message.message?.imageMessage?.caption ??
    message.message?.videoMessage?.caption ??
    null
  );
}
