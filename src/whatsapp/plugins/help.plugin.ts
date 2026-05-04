import { Injectable } from '@nestjs/common';
import { PrtgService } from '../../prtg/prtg.service';
import type { WhatsappPlugin, WhatsappPluginContext } from './whatsapp-plugin';

@Injectable()
export class HelpPlugin implements WhatsappPlugin {
  name = 'help-plugin';

  constructor(private readonly prtgService: PrtgService) {}

  canHandle({ text }: WhatsappPluginContext) {
    return text?.trim().toLowerCase() === '/help';
  }

  async handle(context: WhatsappPluginContext) {
    const isAdmin = await this.prtgService.isAdminRecipient(context.senderJids);
    const lines = [
      '*Haruyaki Ops Help*',
      '',
      '*Umum*',
      '/help - tampilkan menu bantuan',
      'ping - cek bot',
      'hello - sapaan bot',
      '/group - lihat group PRTG aktif',
      '/group <no|nama> - kirim chart group PRTG',
      '/status atau /info - status pengirim dan server',
    ];

    if (isAdmin) {
      lines.push('', '*Admin Only - PRTG Menu*');
      lines.push(
        '/prtg help - menu lengkap admin',
        '/prtg groups - CRUD group PRTG',
        '/prtg group add Bungaraya',
        '/prtg group add Kota Baru Pekanbaru',
        '/prtg configs - CRUD config PRTG',
        '/prtg receipts - CRUD receipt WhatsApp',
        '/prtg schedules - CRUD schedule',
        '/prtg cookie set <cookie/curl>',
        '',
        'Ketik /prtg help untuk format lengkap. Gunakan | untuk parameter panjang.',
      );
    }

    await context.sendMessage(
      context.remoteJid,
      { text: lines.join('\n') },
      { quoted: context.message },
    );
  }
}
