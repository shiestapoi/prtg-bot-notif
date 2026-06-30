import { Injectable, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';

@Injectable()
export class TelegramSenderService {
  private readonly logger = new Logger(TelegramSenderService.name);
  private bot: any = null;

  setBot(bot: any) {
    this.bot = bot;
  }

  getBot(): any {
    return this.bot;
  }

  async sendTextToChatId(chatId: string | number, text: string): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Telegram bot is not initialized. Cannot send message.');
      return;
    }
    try {
      await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error(
        `Failed to send text to ${chatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async sendImageToChatId(
    chatId: string | number,
    payload: { buffer: Buffer; caption?: string },
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Telegram bot is not initialized. Cannot send image.');
      return;
    }
    try {
      await this.bot.sendPhoto(chatId, payload.buffer, {
        caption: payload.caption,
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send image to ${chatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
