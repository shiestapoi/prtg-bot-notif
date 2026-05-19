import { Injectable } from '@nestjs/common';
import { WhatsappSocketStore } from './whatsapp-socket.store';

@Injectable()
export class WhatsappSenderService {
  constructor(private readonly socketStore: WhatsappSocketStore) {}

  async sendTextToJid(jid: string, text: string): Promise<void> {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }
    await socket.sendMessage(jid, { text });
  }

  async sendImageToJid(
    jid: string,
    payload: { buffer: Buffer; caption?: string; mimeType?: string },
  ): Promise<void> {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }
    await socket.sendMessage(jid, {
      image: payload.buffer,
      mimetype: payload.mimeType ?? 'image/png',
      caption: payload.caption,
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
