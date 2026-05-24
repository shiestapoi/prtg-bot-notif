import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PrtgReportSchedulerService } from './prtg-report-scheduler.service';
import { PrtgReportService } from './prtg-report.service';
import { CreatePrtgConfigDto } from './dto/create-prtg-config.dto';
import { UpdatePrtgConfigDto } from './dto/update-prtg-config.dto';

@Controller('api/prtg')
@UseGuards(AuthGuard)
export class PrtgReportController {
  constructor(
    private readonly prtgReportService: PrtgReportService,
    private readonly scheduler: PrtgReportSchedulerService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Groups
  // ──────────────────────────────────────────────────────────────────────────

  @Get('groups')
  listGroups() {
    return this.prtgReportService.listGroups();
  }

  @Post('groups')
  createGroup(@Body() body: Record<string, unknown>) {
    return this.prtgReportService.createGroup({
      name: body.name as string | undefined,
      enabled: body.enabled as boolean | undefined,
    });
  }

  @Put('groups/:id')
  async updateGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    const group = await this.prtgReportService.updateGroup(id, {
      name: body.name as string | undefined,
      enabled: body.enabled as boolean | undefined,
    });
    await this.scheduler.syncSchedules();
    return group;
  }

  @Delete('groups/:id')
  async deleteGroup(@Param('id', ParseIntPipe) id: number) {
    const result = await this.prtgReportService.deleteGroup(id);
    await this.scheduler.syncSchedules();
    return result;
  }

  @Post('groups/:id/send')
  sendGroup(@Param('id') id: string) {
    if (id === 'ALL') return this.prtgReportService.dispatchGroup('ALL');
    const numId = Number(id);
    if (isNaN(numId)) throw new BadRequestException('Invalid group id');
    return this.prtgReportService.dispatchGroup(numId);
  }

  @Post('groups/emergency/disable-all')
  @HttpCode(200)
  async disableAllGroups() {
    const result = await this.prtgReportService.disableAllGroups();
    await this.scheduler.syncSchedules();
    return result;
  }

  @Post('groups/emergency/enable-all')
  @HttpCode(200)
  async enableAllGroups() {
    const result = await this.prtgReportService.enableAllGroups();
    await this.scheduler.syncSchedules();
    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Configs
  // ──────────────────────────────────────────────────────────────────────────

  @Get('configs')
  listConfigs() {
    return this.prtgReportService.listConfigs();
  }

  @Post('configs')
  async createConfig(@Body() body: CreatePrtgConfigDto) {
    return this.prtgReportService.createConfig(body);
  }

  @Put('configs/:id')
  async updateConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePrtgConfigDto,
  ) {
    return this.prtgReportService.updateConfig(id, body);
  }

  @Delete('configs/:id')
  deleteConfig(@Param('id', ParseIntPipe) id: number) {
    return this.prtgReportService.deleteConfig(id);
  }

  @Post('configs/:id/send')
  sendConfig(@Param('id', ParseIntPipe) id: number) {
    return this.prtgReportService.dispatchConfig(id);
  }

  @Put('configs/:id/maintenance')
  async toggleMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { maintenance: boolean; maintenanceLabel?: string | null },
  ) {
    return this.prtgReportService.updateConfig(id, {
      maintenance: body.maintenance,
      maintenanceLabel: body.maintenance ? (body.maintenanceLabel ?? 'Maintenance') : null,
    });
  }

  @Get('settings')
  getSettings() {
    return this.prtgReportService.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.prtgReportService.updateSettings({
      loginUrl: body.loginUrl as string | undefined,
      loginUsername:
        typeof body.loginUsername === 'string' ? body.loginUsername : null,
      loginPassword:
        'loginPassword' in body && typeof body.loginPassword === 'string'
          ? body.loginPassword
          : undefined,
      messageTemplate: body.messageTemplate as string | undefined,
      alertMessageTemplate: body.alertMessageTemplate as string | undefined,
      recoveryMessageTemplate: body.recoveryMessageTemplate as string | undefined,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cookies
  // ──────────────────────────────────────────────────────────────────────────

  @Get('cookies')
  listCookies() {
    return this.prtgReportService.listCookies();
  }

  @Post('cookies')
  createCookie(@Body() body: Record<string, unknown>) {
    return this.prtgReportService.createCookie({
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
    return this.prtgReportService.updateCookie(id, {
      label: body.label as string | undefined,
      value: body.value as string | undefined,
      isActive: body.isActive as boolean | undefined,
    });
  }

  @Delete('cookies/:id')
  deleteCookie(@Param('id', ParseIntPipe) id: number) {
    return this.prtgReportService.deleteCookie(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Recipients
  // ──────────────────────────────────────────────────────────────────────────

  @Get('recipients')
  listRecipients() {
    return this.prtgReportService.listRecipients();
  }

  @Post('recipients')
  createRecipient(@Body() body: Record<string, unknown>) {
    return this.prtgReportService.createRecipient({
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
    const payload: Parameters<typeof this.prtgReportService.updateRecipient>[1] = {
      label: body.label as string | undefined,
      phoneNumber: body.phoneNumber as string | undefined,
      targetType: body.targetType as string | undefined,
      enabled: body.enabled as boolean | undefined,
      isAdmin: body.isAdmin as boolean | undefined,
    };
    if ('groupId' in body) {
      payload.groupId = typeof body.groupId === 'number' ? body.groupId : null;
    }
    return this.prtgReportService.updateRecipient(id, payload);
  }

  @Delete('recipients/:id')
  deleteRecipient(@Param('id', ParseIntPipe) id: number) {
    return this.prtgReportService.deleteRecipient(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Schedules
  // ──────────────────────────────────────────────────────────────────────────

  @Get('schedules')
  listSchedules() {
    return this.prtgReportService.listSchedules();
  }

  @Post('schedules/run-enabled')
  runEnabledSchedules() {
    return this.scheduler.dispatchEnabledSchedules();
  }

  @Post('schedules')
  async createSchedule(@Body() body: Record<string, unknown>) {
    if (!body.cron || typeof body.cron !== 'string') {
      throw new BadRequestException('cron is required.');
    }

    // groupId: null or missing → dispatch ALL groups
    const groupId = typeof body.groupId === 'number' ? body.groupId : null;

    const schedule = await this.prtgReportService.createSchedule({
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

    const schedule = await this.prtgReportService.updateSchedule(id, payload);
    await this.scheduler.syncSchedules();
    return schedule;
  }

  @Post('schedules/:id/run')
  runSchedule(@Param('id', ParseIntPipe) id: number) {
    return this.scheduler.dispatchSchedule(id);
  }

  @Delete('schedules/:id')
  async deleteSchedule(@Param('id', ParseIntPipe) id: number) {
    const result = await this.prtgReportService.deleteSchedule(id);
    await this.scheduler.syncSchedules();
    return result;
  }
}
