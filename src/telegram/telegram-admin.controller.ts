import { Controller, Get, Param, Patch, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { TelegramService } from './telegram.service';

@UseGuards(AuthGuard)
@Controller('api/telegram')
export class TelegramAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService
  ) {}

  @Get('users')
  async listUsers() {
    return this.prisma.telegramUser.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  @Patch('users/:id/verify')
  async verifyUser(@Param('id') id: string, @Body() body: { isVerified: boolean }) {
    return this.prisma.telegramUser.update({
      where: { id },
      data: { isVerified: body.isVerified }
    });
  }

  @Patch('users/:id/block')
  async blockUser(@Param('id') id: string, @Body() body: { isBlocked: boolean }) {
    return this.prisma.telegramUser.update({
      where: { id },
      data: { isBlocked: body.isBlocked }
    });
  }
  
  @Patch('reload-bot')
  async reloadBot() {
    await this.telegramService.reloadBot();
    return { success: true, message: 'Bot reloaded' };
  }
}
