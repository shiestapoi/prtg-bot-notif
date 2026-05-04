import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PrtgSchedulerService } from './prtg.scheduler.service';
import { PrtgService } from './prtg.service';

@Controller('prtg')
@UseGuards(AuthGuard)
export class PrtgController {
  constructor(
    private readonly prtgService: PrtgService,
    private readonly scheduler: PrtgSchedulerService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Groups
  // ──────────────────────────────────────────────────────────────────────────

  @Get('groups')
  listGroups() {
    return this.prtgService.listGroups();
  }

  @Post('groups')
  createGroup(@Body() body: Record<string, unknown>) {
    return this.prtgService.createGroup({
      name: body.name as string | undefined,
      enabled: body.enabled as boolean | undefined,
    });
  }

  @Put('groups/:id')
  async updateGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    const group = await this.prtgService.updateGroup(id, {
      name: body.name as string | undefined,
      enabled: body.enabled as boolean | undefined,
    });
    await this.scheduler.syncSchedules();
    return group;
  }

  @Delete('groups/:id')
  async deleteGroup(@Param('id', ParseIntPipe) id: number) {
    const result = await this.prtgService.deleteGroup(id);
    await this.scheduler.syncSchedules();
    return result;
  }

  @Post('groups/:id/send')
  sendGroup(@Param('id') id: string) {
    if (id === 'ALL') return this.prtgService.dispatchGroup('ALL');
    const numId = Number(id);
    if (isNaN(numId)) throw new BadRequestException('Invalid group id');
    return this.prtgService.dispatchGroup(numId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Configs
  // ──────────────────────────────────────────────────────────────────────────

  @Get('configs')
  listConfigs() {
    return this.prtgService.listConfigs();
  }

  @Post('configs')
  async createConfig(@Body() body: Record<string, unknown>) {
    return this.prtgService.createConfig({
      title: body.title as string | undefined,
      requestUrl: body.requestUrl as string | undefined,
      curlCommand: body.curlCommand as string | undefined,
      groupId: typeof body.groupId === 'number' ? body.groupId : undefined,
      enabled: body.enabled as boolean | undefined,
      cookieId: typeof body.cookieId === 'number' ? body.cookieId : null,
    });
  }

  @Put('configs/:id')
  async updateConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.prtgService.updateConfig(id, {
      title: body.title as string | undefined,
      requestUrl: body.requestUrl as string | undefined,
      curlCommand: body.curlCommand as string | undefined,
      groupId: typeof body.groupId === 'number' ? body.groupId : undefined,
      enabled: body.enabled as boolean | undefined,
      cookieId: typeof body.cookieId === 'number' ? body.cookieId : null,
    });
  }

  @Delete('configs/:id')
  deleteConfig(@Param('id', ParseIntPipe) id: number) {
    return this.prtgService.deleteConfig(id);
  }

  @Post('configs/:id/send')
  sendConfig(@Param('id', ParseIntPipe) id: number) {
    return this.prtgService.dispatchConfig(id);
  }

  @Get('settings')
  getSettings() {
    return this.prtgService.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.prtgService.updateSettings({
      loginUrl: body.loginUrl as string | undefined,
      loginUsername:
        typeof body.loginUsername === 'string' ? body.loginUsername : null,
      loginPassword:
        'loginPassword' in body && typeof body.loginPassword === 'string'
          ? body.loginPassword
          : undefined,
      messageTemplate: body.messageTemplate as string | undefined,
      privateMessageTemplate: body.privateMessageTemplate as string | undefined,
      groupMessageTemplate: body.groupMessageTemplate as string | undefined,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cookies
  // ──────────────────────────────────────────────────────────────────────────

  @Get('cookies')
  listCookies() {
    return this.prtgService.listCookies();
  }

  @Post('cookies')
  createCookie(@Body() body: Record<string, unknown>) {
    return this.prtgService.createCookie({
      label: body.label as string | undefined,
      value: body.value as string | undefined,
      isActive: body.isActive as boolean | undefined,
    });
  }

  @Put('cookies/:id')
  updateCookie(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.prtgService.updateCookie(id, {
      label: body.label as string | undefined,
      value: body.value as string | undefined,
      isActive: body.isActive as boolean | undefined,
    });
  }

  @Delete('cookies/:id')
  deleteCookie(@Param('id', ParseIntPipe) id: number) {
    return this.prtgService.deleteCookie(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Recipients
  // ──────────────────────────────────────────────────────────────────────────

  @Get('recipients')
  listRecipients() {
    return this.prtgService.listRecipients();
  }

  @Post('recipients')
  createRecipient(@Body() body: Record<string, unknown>) {
    return this.prtgService.createRecipient({
      label: body.label as string | undefined,
      phoneNumber: body.phoneNumber as string | undefined,
      targetType: body.targetType as string | undefined,
      enabled: body.enabled as boolean | undefined,
      isAdmin: body.isAdmin as boolean | undefined,
      groupId: typeof body.groupId === 'number' ? body.groupId : null,
    });
  }

  @Put('recipients/:id')
  updateRecipient(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    const payload: Parameters<typeof this.prtgService.updateRecipient>[1] = {
      label: body.label as string | undefined,
      phoneNumber: body.phoneNumber as string | undefined,
      targetType: body.targetType as string | undefined,
      enabled: body.enabled as boolean | undefined,
      isAdmin: body.isAdmin as boolean | undefined,
    };
    if ('groupId' in body) {
      payload.groupId = typeof body.groupId === 'number' ? body.groupId : null;
    }
    return this.prtgService.updateRecipient(id, payload);
  }

  @Delete('recipients/:id')
  deleteRecipient(@Param('id', ParseIntPipe) id: number) {
    return this.prtgService.deleteRecipient(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Schedules
  // ──────────────────────────────────────────────────────────────────────────

  @Get('schedules')
  listSchedules() {
    return this.prtgService.listSchedules();
  }

  @Post('schedules')
  async createSchedule(@Body() body: Record<string, unknown>) {
    if (!body.cron || typeof body.cron !== 'string') {
      throw new BadRequestException('cron is required.');
    }

    // groupId: null or missing → dispatch ALL groups
    const groupId = typeof body.groupId === 'number' ? body.groupId : null;

    const schedule = await this.prtgService.createSchedule({
      name: body.name as string | undefined,
      groupId,
      cron: body.cron,
      targetMode: body.targetMode as string | undefined,
      enabled: body.enabled as boolean | undefined,
    });

    await this.scheduler.syncSchedules();
    return schedule;
  }

  @Put('schedules/:id')
  async updateSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    const payload: {
      name?: string;
      groupId?: number | null;
      cron?: string;
      targetMode?: string;
      enabled?: boolean;
    } = {
      name: body.name as string | undefined,
      cron: body.cron as string | undefined,
      targetMode: body.targetMode as string | undefined,
      enabled: body.enabled as boolean | undefined,
    };

    // Only pass groupId when the key is present in the request body so the
    // service can distinguish "caller wants ALL" (null) from "caller didn't touch it" (key absent).
    if ('groupId' in body) {
      payload.groupId = typeof body.groupId === 'number' ? body.groupId : null;
    }

    const schedule = await this.prtgService.updateSchedule(id, payload);
    await this.scheduler.syncSchedules();
    return schedule;
  }

  @Delete('schedules/:id')
  async deleteSchedule(@Param('id', ParseIntPipe) id: number) {
    const result = await this.prtgService.deleteSchedule(id);
    await this.scheduler.syncSchedules();
    return result;
  }
}
