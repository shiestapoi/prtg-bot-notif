/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { ScreenshotService } from '../monitoring/dispatcher/screenshot.service';
import { renderTemplate } from '../monitoring/dispatcher/alert-dispatcher.service';

@UseGuards(AuthGuard)
@Controller('api/telegram')
export class TelegramAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly telegramSenderService: TelegramSenderService,
    private readonly screenshotService: ScreenshotService,
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

    const timeStr = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    })
      .format(new Date())
      .replace('.', ':');

    const prtgSetting = await this.prisma.prtgSetting.findFirst({
      where: { id: 1 },
    });

    const prtgUrl =
      prtgSetting?.loginUrl?.replace(/\/index\.htm$/, '')?.replace(/\/$/, '') ||
      'http://prtg.r1net.id';

    const now = new Date();
    // For normal alert, we typically fetch 2 hours or short range. Let's do 2 hours for the graph.
    const sdateObj = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const edateObj = new Date(now.getTime() + 5 * 60 * 1000);
    const formatDateUrl = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;

    const requestUrl = `${prtgUrl}/chart.png?id=${config.sensorId}&avg=60&sdate=${formatDateUrl(sdateObj)}&edate=${formatDateUrl(edateObj)}&width=800&height=400&graphstyling=baseFontSize%3D%2712%27%20showLegend%3D%271%27&graphid=-1`;
    const screenshot = await this.screenshotService.capture(requestUrl);

    const templateBody =
      prtgSetting?.alertMessageTemplate ||
      'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n' +
        'âš ï¸ *ALERT: {status}*\n' +
        'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n' +
        'ðŸ“ *{title}*\n' +
        'ðŸ¢ _{groupName}_\n' +
        'â° {time}\n' +
        'ðŸ“Š Total: ```{bitrate}```\n' +
        'ðŸ“¥ In: ```{trafficIn}```\n' +
        'ðŸ“¤ Out: ```{trafficOut}```\n' +
        'ðŸ’¬ {reason}\n' +
        'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”';

    const message = renderTemplate(templateBody, {
      title: config.title,
      status: 'NORMAL',
      previousStatus: 'NORMAL',
      bitrate:
        history?.totalTrafficBitrate !== null &&
        history?.totalTrafficBitrate !== undefined
          ? `${(history.totalTrafficBitrate / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`
          : 'N/A',
      trafficIn: inbound,
      trafficOut: outbound,
      timestamp: new Date().toISOString(),
      time: timeStr,
      reason: 'Test Notifikasi (Debug)',
      groupName: config.group?.name || 'N/A',
    });

    const telegramUsers = await this.prisma.telegramUser.findMany({
      where: { isVerified: true, isBlocked: false },
    });

    let sent = 0;
    for (const user of telegramUsers) {
      try {
        if (screenshot) {
          await this.telegramSenderService.sendImageToChatId(user.telegramId, {
            buffer: screenshot,
            caption: message,
          });
        } else {
          await this.telegramSenderService.sendTextToChatId(
            user.telegramId,
            message,
          );
        }
        sent++;
      } catch (e) {
        // ignore
      }
    }

    return { success: true, message: `Debug sent to ${sent} Telegram users.` };
  }
}
