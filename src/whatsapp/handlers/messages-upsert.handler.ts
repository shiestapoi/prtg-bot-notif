import type { Logger } from '@nestjs/common';
import type { MessageUpsertType, WAMessage, WASocket } from 'baileys';
import {
  extractMediaInfo,
  extractMessageText,
  extractStructuredMessageContent,
} from '../lib';
import type { WhatsappPlugin } from '../plugins/whatsapp-plugin';
import {
  isProcessableMessage,
  resolveIncomingChatJid,
} from '../utils/message-utils';
import { processIncomingMessage } from './incoming-message.processor';

function uniqueValues(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function previewText(value: string | null) {
  if (!value) {
    return '<non-text>';
  }

  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

export interface MessagesUpsertHandlerParams {
  logger: Logger;
  socket: WASocket;
  sessionName: string;
  messages: WAMessage[];
  type: MessageUpsertType;
  plugins: WhatsappPlugin[];
  sendReceipt: boolean;
  isCommandAuthorized: (
    senderJids: string[],
    isFromMe: boolean,
  ) => Promise<boolean>;
}

export async function handleMessagesUpsert({
  logger,
  socket,
  sessionName,
  messages,
  type,
  plugins,
  sendReceipt,
  isCommandAuthorized,
}: MessagesUpsertHandlerParams): Promise<void> {
  logger.debug(
    `Session ${sessionName} received messages.upsert event (${type}) with ${messages.length} message(s)`,
  );

  if (type !== 'notify' && type !== 'append') {
    return;
  }

  for (const message of messages) {
    const remoteJid = resolveIncomingChatJid(message);

    if (!isProcessableMessage(message, remoteJid)) {
      continue;
    }

    if (!remoteJid) {
      continue;
    }

    if (sendReceipt) {
      try {
        await socket.readMessages([message.key]);
      } catch (error) {
        logger.warn(
          `Failed to send read receipt for ${remoteJid}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const media = extractMediaInfo(message);
    const text = extractMessageText(message);
    const structured = extractStructuredMessageContent(message);
    const isFromMe = Boolean(message.key.fromMe);
    const senderJids = uniqueValues([
      isFromMe ? socket.user?.id : null,
      message.key.participant,
      message.key.participantAlt,
      message.key.remoteJid,
      message.key.remoteJidAlt,
    ]);
    const senderJid =
      (isFromMe ? socket.user?.id : null) ??
      message.key.participant ??
      message.key.participantAlt ??
      message.key.remoteJid ??
      remoteJid;

    logger.log(
      [
        `WA incoming ${sessionName}`,
        `chat=${remoteJid}`,
        `from=${senderJid}`,
        message.pushName ? `pushName="${message.pushName}"` : null,
        message.key.addressingMode
          ? `mode=${message.key.addressingMode}`
          : null,
        isFromMe ? 'fromMe=true' : null,
        `candidates=${senderJids.join(',') || '-'}`,
        `text="${previewText(text)}"`,
      ]
        .filter(Boolean)
        .join(' | '),
    );

    await processIncomingMessage({
      sessionName,
      socket,
      message,
      remoteJid,
      senderJid,
      senderJids,
      isFromMe,
      text,
      media,
      structured,
      plugins,
      isCommandAuthorized: (context) =>
        isCommandAuthorized(context.senderJids, context.isFromMe),
      logger,
    });
  }
}
