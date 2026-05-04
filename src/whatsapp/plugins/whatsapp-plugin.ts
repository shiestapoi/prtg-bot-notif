import type { Logger } from '@nestjs/common';
import type { WAMessage, WASocket } from 'baileys';
import type {
  ExtractedMediaInfo,
  StructuredWhatsappMessageContent,
} from '../lib';

export interface WhatsappPluginContext {
  sessionName: string;
  socket: WASocket;
  message: WAMessage;
  remoteJid: string;
  senderJid: string;
  senderJids: string[];
  sendMessage: (
    remoteJid: string,
    content: Parameters<WASocket['sendMessage']>[1],
    options?: Parameters<WASocket['sendMessage']>[2],
  ) => Promise<{ messageId: string | null; remoteJid: string | null }>;
  text: string | null;
  media: ExtractedMediaInfo;
  structured: StructuredWhatsappMessageContent | null;
  logger: Logger;
}

export interface WhatsappPlugin {
  name: string;
  canHandle(context: WhatsappPluginContext): boolean | Promise<boolean>;
  handle(context: WhatsappPluginContext): Promise<void>;
}
