/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-require-imports */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramSenderService } from './telegram-sender.service';
import { PrtgReportService } from '../prtg-report/prtg-report.service';
import { ScreenshotService } from '../monitoring/dispatcher/screenshot.service';
import { ReceiptReportService } from '../receipt-report/receipt-report.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramSender: TelegramSenderService,
    private readonly prtgService: PrtgReportService,
    private readonly screenshotService: ScreenshotService,
    private readonly receiptService: ReceiptReportService,
  ) {}

  async onModuleInit() {
    await this.initBot();
  }

  onModuleDestroy() {
    this.stopBot();
  }

  async initBot() {
    this.stopBot();

    const setting = await this.prisma.prtgSetting.findFirst({
      where: { id: 1 },
    });
    if (!setting?.telegramBotToken) {
      this.logger.warn(
        'Telegram bot token is not configured. Bot will not start.',
      );
      return;
    }

    const TelegramBotClass = require('node-telegram-bot-api');
    const BotConstructor = TelegramBotClass.default || TelegramBotClass;
    this.bot = new BotConstructor(setting.telegramBotToken, { polling: true });
    this.telegramSender.setBot(this.bot);
    this.logger.log('Telegram bot started.');

    this.bot.onText(/^\/start/, (msg) => this.handleStart(msg));
    this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));
    this.bot.on('message', (msg) => this.handleMessage(msg));
  }

  stopBot() {
    if (this.bot) {
      this.bot.stopPolling();
      this.bot = null;
      this.telegramSender.setBot(null as any);
      this.logger.log('Telegram bot stopped.');
    }
  }

  async reloadBot() {
    this.logger.log('Reloading Telegram bot...');
    await this.initBot();
  }

  private async handleStart(msg: TelegramBot.Message) {
    if (!this.bot || !msg.from) return;
    const chatId = msg.chat.id;

    const user = await this.getOrRegisterUser(msg.from);

    if (user.isBlocked) {
      return;
    }

    if (!user.isVerified) {
      await this.bot.sendMessage(
        chatId,
        'Anda belum terverifikasi. Silakan kirimkan Secret Code untuk verifikasi diri.',
      );
      return;
    }

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const downCount = await this.prisma.monitoringHistory.count({
      where: { timestamp: { gte: startOfDay }, status: 'DOWN' },
    });

    const welcomeMsg =
      `👋 *Selamat datang di R1NET NOC Bot*\n\n` +
      `⏱️ *Uptime Sistem*: ${hours}j ${minutes}m\n` +
      `🚨 *Insiden Down Hari Ini*: ${downCount} kejadian\n\n` +
      `Silakan pilih menu di bawah ini:`;

    const opts: any = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Cek Laporan BW', callback_data: 'menu_laporan' }],
          [
            {
              text: 'Laporan Manual (Harian/Bulanan)',
              callback_data: 'menu_laporan_manual',
            },
          ],
          [
            {
              text: 'Kelola Notifikasi Grup',
              callback_data: 'menu_notifikasi',
            },
          ],
        ],
      },
      parse_mode: 'Markdown',
    };

    await this.bot.sendMessage(chatId, welcomeMsg, opts);
  }

  private async handleMessage(msg: TelegramBot.Message) {
    if (!this.bot || !msg.from || !msg.text || msg.text.startsWith('/')) return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    const user = await this.getOrRegisterUser(msg.from);

    if (user.isBlocked) return;

    if (!user.isVerified) {
      const setting = await this.prisma.prtgSetting.findFirst({
        where: { id: 1 },
      });
      if (setting?.telegramSecretCode && text === setting.telegramSecretCode) {
        await this.prisma.telegramUser.update({
          where: { id: user.id },
          data: { isVerified: true },
        });

        try {
          await this.bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {
          this.logger.warn(`Failed to delete secret code message: ${e}`);
        }

        await this.bot.sendMessage(
          chatId,
          '✅ Verifikasi berhasil! Ketik /start untuk melihat menu.',
        );
      } else {
        await this.bot.sendMessage(
          chatId,
          '❌ Secret code salah atau belum diatur.',
        );
      }
    }
  }

  private async handleCallbackQuery(query: TelegramBot.CallbackQuery) {
    if (!this.bot || !query.message || !query.from || !query.data) return;
    const chatId = query.message.chat.id;
    const data = query.data;

    const user = await this.prisma.telegramUser.findUnique({
      where: { telegramId: String(query.from.id) },
    });

    if (!user || !user.isVerified || user.isBlocked) {
      await this.bot.answerCallbackQuery(query.id, {
        text: 'Tidak diizinkan',
        show_alert: true,
      });
      return;
    }

    try {
      if (data === 'menu_laporan') {
        const groups = await this.prisma.prtgGroup.findMany({
          where: { enabled: true },
        });
        const buttons = groups.map((g) => [
          { text: g.name, callback_data: `laporan_group_${g.id}` },
        ]);
        buttons.push([{ text: 'Kembali', callback_data: 'menu_main' }]);

        await this.bot.editMessageText('Pilih Grup untuk Laporan:', {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: buttons },
        });
        await this.bot.answerCallbackQuery(query.id);
      } else if (data.startsWith('laporan_group_')) {
        const groupId = data.split('_')[2];
        const buttons = [
          [
            {
              text: '2 Jam Terakhir (Realtime)',
              callback_data: `lap_2jam_${groupId}`,
            },
          ],
          [
            {
              text: '2 Hari Terakhir (Harian)',
              callback_data: `lap_2hari_${groupId}`,
            },
          ],
          [{ text: 'Kembali', callback_data: 'menu_laporan' }],
        ];
        await this.bot.editMessageText('Pilih Rentang Waktu:', {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: buttons },
        });
        await this.bot.answerCallbackQuery(query.id);
      } else if (data.startsWith('lap_2jam_')) {
        const groupId = Number(data.split('_')[2]);
        await this.bot.answerCallbackQuery(query.id, {
          text: '⏳ Sedang memproses...',
        });
        await this.bot.editMessageText(
          '⏳ *Sedang mengambil data 2 jam terakhir...*\n\nMohon tunggu, proses ini memerlukan waktu.',
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
          },
        );
        const typingInterval = this.startTypingIndicator(chatId);
        try {
          await this.sendChartReport(chatId, groupId, 2);
        } finally {
          clearInterval(typingInterval);
        }
      } else if (data.startsWith('lap_2hari_')) {
        const groupId = Number(data.split('_')[2]);
        await this.bot.answerCallbackQuery(query.id, {
          text: '⏳ Sedang memproses...',
        });
        await this.bot.editMessageText(
          '⏳ *Sedang mengambil data 2 hari terakhir...*\n\nMohon tunggu, proses ini memerlukan waktu.',
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
          },
        );
        const typingInterval = this.startTypingIndicator(chatId);
        try {
          await this.sendChartReport(chatId, groupId, 48);
        } finally {
          clearInterval(typingInterval);
        }
      } else if (data === 'menu_laporan_manual') {
        const buttons = [
          [{ text: 'Laporan Harian', callback_data: 'manual_harian' }],
          [{ text: 'Laporan Bulanan', callback_data: 'manual_bulanan' }],
          [{ text: 'Kembali', callback_data: 'menu_main' }],
        ];
        await this.bot.editMessageText('Pilih Jenis Laporan Manual:', {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: buttons },
        });
        await this.bot.answerCallbackQuery(query.id);
      } else if (data === 'manual_harian') {
        const buttons = [
          [{ text: 'Laporan Hari Ini', callback_data: 'manual_harian_today' }],
          [
            {
              text: 'Laporan Kemarin',
              callback_data: 'manual_harian_yesterday',
            },
          ],
          [{ text: 'Kembali', callback_data: 'menu_laporan_manual' }],
        ];
        await this.bot.editMessageText('Pilih Periode Laporan Harian:', {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: buttons },
        });
        await this.bot.answerCallbackQuery(query.id);
      } else if (data === 'manual_bulanan') {
        const buttons = [
          [{ text: 'Laporan Bulan Ini', callback_data: 'manual_bulanan_this' }],
          [
            {
              text: 'Laporan Bulan Kemarin',
              callback_data: 'manual_bulanan_last',
            },
          ],
          [{ text: 'Kembali', callback_data: 'menu_laporan_manual' }],
        ];
        await this.bot.editMessageText('Pilih Periode Laporan Bulanan:', {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: buttons },
        });
        await this.bot.answerCallbackQuery(query.id);
      } else if (
        data.startsWith('manual_harian_') ||
        data.startsWith('manual_bulanan_')
      ) {
        await this.bot.answerCallbackQuery(query.id, {
          text: '⏳ Sedang memproses laporan...',
        });
        const periodText = data.startsWith('manual_harian_')
          ? 'Harian'
          : 'Bulanan';
        await this.bot.editMessageText(
          `⏳ *Sedang menghasilkan Laporan ${periodText}...*\n\nProses ini mencakup pengambilan data, chart, dan pembuatan PDF. Mohon tunggu.`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
          },
        );
        const typingInterval = this.startTypingIndicator(chatId);
        try {
          await this.handleManualReportRequest(chatId, data);
        } finally {
          clearInterval(typingInterval);
        }
      } else if (data === 'menu_notifikasi') {
        const groups = await this.prisma.prtgGroup.findMany({
          where: { enabled: true },
        });
        const mutes = await this.prisma.telegramMute.findMany({
          where: { telegramUserId: user.id },
        });
        const mutedGroupIds = new Set(mutes.map((m) => m.groupId));

        const buttons = groups.map((g) => {
          const isMuted = mutedGroupIds.has(g.id);
          const text = isMuted ? `🔇 Unmute ${g.name}` : `🔊 Mute ${g.name}`;
          const action = isMuted ? 'unmute' : 'mute';
          return [{ text, callback_data: `notif_${action}_${g.id}` }];
        });
        buttons.push([{ text: 'Kembali', callback_data: 'menu_main' }]);

        await this.bot.editMessageText('Kelola Notifikasi Grup:', {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: buttons },
        });
        await this.bot.answerCallbackQuery(query.id);
      } else if (
        data.startsWith('notif_mute_') ||
        data.startsWith('notif_unmute_')
      ) {
        const parts = data.split('_');
        const action = parts[1];
        const groupId = Number(parts[2]);

        if (action === 'mute') {
          await this.prisma.telegramMute.upsert({
            where: {
              telegramUserId_groupId: { telegramUserId: user.id, groupId },
            },
            create: { telegramUserId: user.id, groupId, isMuted: true },
            update: { isMuted: true },
          });
        } else {
          await this.prisma.telegramMute.deleteMany({
            where: { telegramUserId: user.id, groupId },
          });
        }

        // Refresh menu notifikasi
        await this.handleCallbackQuery({
          ...query,
          data: 'menu_notifikasi',
        });
        await this.bot.answerCallbackQuery(query.id, {
          text: action === 'mute' ? 'Grup di-mute' : 'Grup di-unmute',
        });
      } else if (data === 'menu_main') {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const downCount = await this.prisma.monitoringHistory.count({
          where: { timestamp: { gte: startOfDay }, status: 'DOWN' },
        });

        const welcomeMsg =
          `👋 *Selamat datang di R1NET NOC Bot*\n\n` +
          `⏱️ *Uptime Sistem*: ${hours}j ${minutes}m\n` +
          `🚨 *Insiden Down Hari Ini*: ${downCount} kejadian\n\n` +
          `Silakan pilih menu di bawah ini:`;

        const opts: any = {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Cek Laporan BW', callback_data: 'menu_laporan' }],
              [
                {
                  text: 'Laporan Manual (Harian/Bulanan)',
                  callback_data: 'menu_laporan_manual',
                },
              ],
              [
                {
                  text: 'Kelola Notifikasi Grup',
                  callback_data: 'menu_notifikasi',
                },
              ],
            ],
          },
          parse_mode: 'Markdown',
        };
        await this.bot.editMessageText(welcomeMsg, opts);
        await this.bot.answerCallbackQuery(query.id);
      } else {
        await this.bot.answerCallbackQuery(query.id);
      }
    } catch (error) {
      this.logger.error(`Error in callback query: ${error}`);
      await this.bot.answerCallbackQuery(query.id, {
        text: 'Terjadi kesalahan',
        show_alert: true,
      });
    }
  }

  private async getOrRegisterUser(from: TelegramBot.User) {
    const telegramId = String(from.id);
    let user = await this.prisma.telegramUser.findUnique({
      where: { telegramId },
    });
    if (!user) {
      user = await this.prisma.telegramUser.create({
        data: {
          telegramId,
          firstName: from.first_name,
          lastName: from.last_name,
          username: from.username,
        },
      });
    }
    return user;
  }

  /**
   * Start a repeating 'typing' chat action indicator.
   * Telegram typing status auto-expires after ~5s, so we re-send every 4s.
   * Returns the interval ID — caller MUST clearInterval() when done.
   */
  private startTypingIndicator(chatId: number | string): ReturnType<typeof setInterval> {
    // Send immediately
    this.bot?.sendChatAction(chatId, 'typing').catch(() => {});
    // Then repeat every 4 seconds
    return setInterval(() => {
      this.bot?.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);
  }

  private async sendChartReport(
    chatId: number,
    groupId: number,
    hours: number,
  ) {
    const configs = await this.prisma.prtgConfig.findMany({
      where: { groupId, enabled: true },
      include: { group: true },
    });

    if (configs.length === 0) {
      await this.telegramSender.sendTextToChatId(
        chatId,
        'Tidak ada config aktif di grup ini.',
      );
      return;
    }

    const setting = await this.prisma.prtgSetting.findFirst({
      where: { id: 1 },
    });
    const prtgUrl =
      setting?.loginUrl?.replace(/\/index\.htm$/, '')?.replace(/\/$/, '') ||
      'http://prtg.r1net.id';

    const now = new Date();
    const sdateObj = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const edateObj = new Date(now.getTime() + 5 * 60 * 1000);
    const formatDateUrl = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;

    let sent = 0;
    for (const config of configs) {
      const history = await this.prisma.monitoringHistory.findFirst({
        where: { configId: config.id },
        orderBy: { timestamp: 'desc' },
      });
      const bitrate =
        history?.totalTrafficBitrate !== null &&
        history?.totalTrafficBitrate !== undefined
          ? `${(history.totalTrafficBitrate / 1_000_000).toFixed(2)} Mbit/s`
          : 'N/A';

      const timeStr = now
        .toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        .replace(':', '.');
      const rangeText = hours === 2 ? '2 Jam' : '2 Hari';
      const caption = `${config.title} - Range ${rangeText}\n🏢 ${config.group.name}\n⏰ ${timeStr}\n📊 Traffic: ${bitrate}`;

      const requestUrl = `${prtgUrl}/chart.png?id=${config.sensorId}&avg=60&sdate=${formatDateUrl(sdateObj)}&edate=${formatDateUrl(edateObj)}&width=800&height=400&graphstyling=baseFontSize%3D%2712%27%20showLegend%3D%271%27&graphid=-1`;
      const screenshot = await this.screenshotService.capture(requestUrl);
      if (screenshot) {
        await this.telegramSender.sendImageToChatId(chatId, {
          buffer: screenshot,
          caption,
        });
        sent++;
      } else {
        this.logger.warn(
          `Failed to capture screenshot for config ${config.id} at ${requestUrl}`,
        );
      }
    }

    if (sent === 0) {
      await this.telegramSender.sendTextToChatId(
        chatId,
        `Gagal mengambil data laporan ${hours} jam terakhir.`,
      );
    }
  }

  private async send2HoursReport(chatId: number, groupId: number) {
    await this.sendChartReport(chatId, groupId, 2);
  }

  private async handleManualReportRequest(chatId: number, data: string) {
    let period: 'DAILY' | 'MONTHLY';
    const dateRef = new Date();

    if (data === 'manual_harian_today') {
      period = 'DAILY';
      dateRef.setHours(0, 0, 0, 0);
    } else if (data === 'manual_harian_yesterday') {
      period = 'DAILY';
      dateRef.setDate(dateRef.getDate() - 1);
      dateRef.setHours(0, 0, 0, 0);
    } else if (data === 'manual_bulanan_this') {
      period = 'MONTHLY';
      dateRef.setDate(1);
      dateRef.setHours(0, 0, 0, 0);
    } else if (data === 'manual_bulanan_last') {
      period = 'MONTHLY';
      dateRef.setMonth(dateRef.getMonth() - 1);
      dateRef.setDate(1);
      dateRef.setHours(0, 0, 0, 0);
    } else {
      return;
    }

    try {
      await this.receiptService.generateManualReport(chatId, period, dateRef);
    } catch (e) {
      this.logger.error(`Error generating manual report: ${e}`);
      await this.telegramSender.sendTextToChatId(
        chatId,
        '❌ Gagal menghasilkan laporan manual.',
      );
    }
  }
}
