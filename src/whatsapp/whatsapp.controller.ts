import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Body,
  Query,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import type {
  WhatsappHealthResponse,
  WhatsappServiceAvailabilityResponse,
  WhatsappStatusResponse,
} from './whatsapp.types';
import { WhatsappRealtimeService } from './whatsapp-realtime.service';
import { WhatsappService } from './whatsapp.service';

@Controller('api/whatsapp')
@UseGuards(AuthGuard)
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly realtime: WhatsappRealtimeService,
  ) {}

  private ensureServiceEnabledOrThrow() {
    if (this.whatsappService.isServiceEnabled()) {
      return;
    }

    throw new HttpException(
      this.whatsappService.getServiceUnavailableResponse(),
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  @Get('status')
  getStatus(): WhatsappStatusResponse | WhatsappServiceAvailabilityResponse {
    this.ensureServiceEnabledOrThrow();
    return this.whatsappService.getStatus();
  }

  @Get('health')
  getHealth(): WhatsappHealthResponse | WhatsappServiceAvailabilityResponse {
    this.ensureServiceEnabledOrThrow();
    return this.whatsappService.getHealth();
  }

  @Get('targets')
  getTargets() {
    this.ensureServiceEnabledOrThrow();
    return this.whatsappService.listTargets();
  }

  @Post('logout')
  async logout() {
    this.ensureServiceEnabledOrThrow();
    await this.whatsappService.logout();
    return { success: true, message: 'WhatsApp session logged out.' };
  }

  @Post('pairing-code')
  async requestPairingCode(@Body('phoneNumber') phoneNumber: string) {
    this.ensureServiceEnabledOrThrow();
    if (!phoneNumber) {
      throw new BadRequestException('phoneNumber is required');
    }
    const code = await this.whatsappService.requestPairingCode(phoneNumber);
    return { success: true, code };
  }

  @Get('channels/metadata')
  async getChannelMetadata(@Query('key') key?: string) {
    this.ensureServiceEnabledOrThrow();
    if (!key?.trim()) {
      throw new BadRequestException('key is required.');
    }

    return this.whatsappService.getChannelTarget(key);
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    const statusEvents = this.realtime
      .getStatusStream()
      .pipe(map((status) => ({ data: status })));
    const heartbeatEvents = interval(25000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { at: new Date().toISOString() },
      })),
    );

    return merge(statusEvents, heartbeatEvents);
  }
}
