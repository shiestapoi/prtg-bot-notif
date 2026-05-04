import type { Logger } from '@nestjs/common';
import type { WAMessage, WASocket } from 'baileys';
import type {
  ExtractedMediaInfo,
  StructuredWhatsappMessageContent,
} from '../lib';
import type { WhatsappPlugin } from '../plugins/whatsapp-plugin';

export interface IncomingMessageProcessorParams {
  sessionName: string;
  socket: WASocket;
  message: WAMessage;
  remoteJid: string;
  senderJid: string;
  senderJids: string[];
  text: string | null;
  media: ExtractedMediaInfo;
  structured: StructuredWhatsappMessageContent | null;
  plugins: WhatsappPlugin[];
  logger: Logger;
}

export async function processIncomingMessage({
  sessionName,
  socket,
  message,
  remoteJid,
  senderJid,
  senderJids,
  text,
  media,
  structured,
  plugins,
  logger,
}: IncomingMessageProcessorParams): Promise<void> {
  const sendMessage = async (
    targetJid: string,
    content: Parameters<WASocket['sendMessage']>[1],
    options?: Parameters<WASocket['sendMessage']>[2],
  ) => {
    const sent = await socket.sendMessage(targetJid, content, options);
    return {
      messageId: sent?.key?.id ?? null,
      remoteJid: sent?.key?.remoteJid ?? targetJid,
    };
  };

  const context = {
    sessionName,
    socket,
    message,
    remoteJid,
    senderJid,
    senderJids,
    sendMessage,
    text,
    media,
    structured,
    logger,
  };

  for (const plugin of plugins) {
    let canHandle = false;

    try {
      canHandle = await plugin.canHandle(context);
    } catch (error) {
      logger.error(
        `Plugin ${plugin.name} canHandle failed for ${remoteJid}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (!canHandle) {
      continue;
    }

    try {
      await plugin.handle(context);
    } catch (error) {
      logger.error(
        `Plugin ${plugin.name} handle failed for ${remoteJid}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
