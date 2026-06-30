/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
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
    payload: {
      buffer: Buffer;
      fileName: string;
      caption?: string;
      mimeType?: string;
    },
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

  async sendComplexMessage(payload: {
    to: string;
    text?: string;
    image?: string;
    mentions?: string[];
    contextInfo?: any;
  }) {
    const socket = this.socketStore.getSocket();
    if (!socket) {
      throw new Error('WhatsApp socket is not connected.');
    }

    const jid = this.toJid(payload.to);
    if (!jid) {
      throw new Error('Invalid target phone number or JID.');
    }

    const messageObj: any = {};

    if (payload.image) {
      // check if it's base64 or URL
      if (
        payload.image.startsWith('http://') ||
        payload.image.startsWith('https://')
      ) {
        messageObj.image = { url: payload.image };
      } else {
        // assume base64 string
        messageObj.image = Buffer.from(payload.image, 'base64');
      }

      if (payload.text) {
        messageObj.caption = payload.text;
      }
    } else if (payload.text) {
      messageObj.text = payload.text;
    } else {
      throw new Error('Must provide either text or image.');
    }

    if (payload.mentions && Array.isArray(payload.mentions)) {
      messageObj.mentions = payload.mentions
        .map((m) => this.toJid(m))
        .filter(Boolean);
    }

    if (payload.contextInfo) {
      messageObj.contextInfo = payload.contextInfo;
    }

    const result = await socket.sendMessage(jid, messageObj);
    return { success: true, messageId: result?.key?.id };
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
