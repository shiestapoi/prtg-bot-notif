import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { WhatsappSenderService } from '../whatsapp-sender.service';

export interface SendMessagePayload {
  to: string; // phone number or JID
  text?: string;
  image?: string; // base64 or url
  mentions?: string[]; // array of numbers/JIDs
  contextInfo?: any; // any other context like forwarding score, quoted message, etc
}

@Controller('api/whatsapp')
@UseGuards(ApiKeyGuard)
export class WhatsappApiController {
  constructor(private readonly whatsappSenderService: WhatsappSenderService) {}

  @Post('send')
  async sendMessage(@Body() payload: SendMessagePayload) {
    return this.whatsappSenderService.sendComplexMessage(payload);
  }
}
