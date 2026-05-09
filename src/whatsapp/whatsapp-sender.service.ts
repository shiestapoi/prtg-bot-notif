import { Injectable } from '@nestjs/common';
import { WhatsappSocketStore } from './whatsapp-socket.store';

export interface SentMessageKey {
  remoteJid: string;
  id: string;
  fromMe: boolean;
}

@Injectable()
export class WhatsappSenderService {
  constructor(private readonly socketStore: WhatsappSocketStore) {}

  async sendTextToJid(jid: string, text: string): Promise<SentMessageKey | null> {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }
    const result = await socket.sendMessage(jid, { text });
    return result?.key ? { remoteJid: result.key.remoteJid!, id: result.key.id!, fromMe: true } : null;
  }

  async sendImageToJid(
    jid: string,
    payload: { buffer: Buffer; caption?: string; mimeType?: string },
  ): Promise<SentMessageKey | null> {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }
    const result = await socket.sendMessage(jid, {
      image: payload.buffer,
      mimetype: payload.mimeType ?? 'image/png',
      caption: payload.caption,
    });
    return result?.key ? { remoteJid: result.key.remoteJid!, id: result.key.id!, fromMe: true } : null;
  }

  /**
   * Edit the text/caption of a previously sent message.
   * Only text can be edited — images cannot be changed.
   * Uses Baileys: sock.sendMessage(jid, { text: newText, edit: key })
   */
  async editMessage(jid: string, messageKey: SentMessageKey, newText: string): Promise<void> {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }
    await socket.sendMessage(jid, {
      text: newText,
      edit: { remoteJid: messageKey.remoteJid, id: messageKey.id, fromMe: messageKey.fromMe },
    });
  }

  async sendTextToNumbers(numbers: string[], text: string): Promise<void> {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }

    for (const rawNumber of numbers) {
      const jid = this.toJid(rawNumber);
      if (!jid) {
        continue;
      }
      await socket.sendMessage(jid, { text });
    }
  }

  async sendDocumentToNumbers(
    numbers: string[],
    payload: { buffer: Buffer; fileName: string; caption?: string; mimeType?: string },
  ) {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }

    for (const rawNumber of numbers) {
      const jid = this.toJid(rawNumber);
      if (!jid) {
        continue;
      }

      await socket.sendMessage(jid, {
        document: payload.buffer,
        fileName: payload.fileName,
        mimetype: payload.mimeType ?? 'application/octet-stream',
        caption: payload.caption,
      });
    }
  }

  async sendImageToNumbers(
    numbers: string[],
    payload: { buffer: Buffer; caption?: string; mimeType?: string },
  ) {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }

    for (const rawNumber of numbers) {
      const jid = this.toJid(rawNumber);
      if (!jid) {
        continue;
      }

      await socket.sendMessage(jid, {
        image: payload.buffer,
        mimetype: payload.mimeType ?? 'image/png',
        caption: payload.caption,
      });
    }
  }

  toJid(input: string) {
    const trimmed = input.trim();
    if (
      trimmed.endsWith('@s.whatsapp.net') ||
      trimmed.endsWith('@g.us') ||
      trimmed.endsWith('@newsletter')
    ) {
      return trimmed;
    }

    const normalized = input.replace(/[^0-9]/g, '');
    if (!normalized) {
      return null;
    }

    return `${normalized}@s.whatsapp.net`;
  }
}
