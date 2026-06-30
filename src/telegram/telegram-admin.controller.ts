import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  UseGuards,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { TelegramService } from './telegram.service';
import { TelegramSenderService } from './telegram-sender.service';

@UseGuards(AuthGuard)
@Controller('api/telegram')
export class TelegramAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly telegramSenderService: TelegramSenderService,
  ) {}

  @Get('users')
  async listUsers() {
    return this.prisma.telegramUser.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch('users/:id/verify')
  async verifyUser(
    @Param('id') id: string,
    @Body() body: { isVerified: boolean },
  ) {
    return this.prisma.telegramUser.update({
      where: { id },
      data: { isVerified: body.isVerified },
    });
  }

  @Patch('users/:id/block')
  async blockUser(
    @Param('id') id: string,
    @Body() body: { isBlocked: boolean },
  ) {
    return this.prisma.telegramUser.update({
      where: { id },
      data: { isBlocked: body.isBlocked },
    });
  }

  @Patch('reload-bot')
  async reloadBot() {
    await this.telegramService.reloadBot();
    return { success: true, message: 'Bot reloaded' };
  }

  @Post('debug-notification')
  async debugNotification() {
    const config = await this.prisma.prtgConfig.findFirst({
      where: { enabled: true, maintenance: false },
      include: { group: true },
    });

    if (!config) {
      return { success: false, message: 'Tidak ada config aktif ditemukan.' };
    }

    const history = await this.prisma.monitoringHistory.findFirst({
      where: { configId: config.id },
      orderBy: { timestamp: 'desc' },
    });

    const inbound = history?.inboundBitrate
      ? `${(history.inboundBitrate / 1_000_000).toFixed(2)} Mbit/s`
      : 'N/A';
    const outbound = history?.outboundBitrate
      ? `${(history.outboundBitrate / 1_000_000).toFixed(2)} Mbit/s`
      : 'N/A';

    const time = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    })
      .format(new Date())
      .replace('.', ':');

    const message =
      `🚨 *DEBUG NOTIFICATION TEST* 🚨\n\n` +
      `*${config.title}*\n` +
      `GROUP : ${config.group?.name || 'N/A'}\n` +
      `STATUS : NORMAL (Test)\n` +
      `Waktu : ${time} WIB\n` +
      `Traffic IN : ${inbound}\n` +
      `Traffic OUT : ${outbound}`;

    const telegramUsers = await this.prisma.telegramUser.findMany({
      where: { isVerified: true, isBlocked: false },
    });

    let sent = 0;
    for (const user of telegramUsers) {
      try {
        await this.telegramSenderService.sendTextToChatId(
          user.telegramId,
          message,
        );
        sent++;
      } catch (e) {
        // ignore
      }
    }

    return { success: true, message: `Debug sent to ${sent} Telegram users.` };
  }
}
