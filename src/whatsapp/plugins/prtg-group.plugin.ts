import { Injectable } from '@nestjs/common';
import { PrtgReportService } from '../../prtg-report/prtg-report.service';
import type { WhatsappPlugin, WhatsappPluginContext } from './whatsapp-plugin';

@Injectable()
export class PrtgGroupPlugin implements WhatsappPlugin {
  name = 'prtg-group-plugin';

  constructor(private readonly prtgService: PrtgReportService) {}

  canHandle({ text }: WhatsappPluginContext) {
    return text?.trim().toLowerCase().startsWith('/group') ?? false;
  }

  async handle(context: WhatsappPluginContext) {
    const rawText = context.text?.trim() ?? '';
    const args = rawText.replace(/^\/group\b/i, '').trim();
    const groups = await this.prtgService.listGroupNames();

    if (!groups.length) {
      await context.sendMessage(context.remoteJid, {
        text: 'Belum ada group PRTG yang aktif.',
      });
      return;
    }

    if (!args) {
      const list = groups
        .map((name, index) => `${index + 1}. ${name}`)
        .join('\n');
      await context.sendMessage(context.remoteJid, {
        text: `Daftar group:\n${list}\n\nGunakan /group <no> untuk mengirim.`,
      });
      return;
    }

    const index = Number.parseInt(args, 10);
    const groupName = Number.isNaN(index) ? args : groups[index - 1];

    if (!groupName) {
      const list = groups.map((name, idx) => `${idx + 1}. ${name}`).join('\n');
      await context.sendMessage(context.remoteJid, {
        text: `Group tidak ditemukan.\n\nDaftar group:\n${list}`,
      });
      return;
    }

    await context.sendMessage(context.remoteJid, {
      text: `Mengirim group ${groupName}...`,
    });

    try {
      const result = await this.prtgService.dispatchGroupByName(groupName);
      await context.sendMessage(context.remoteJid, {
        text: `Selesai. ${result.sentConfigs} chart dikirim ke ${result.sentRecipients} nomor.`,
      });
    } catch (error) {
      await context.sendMessage(context.remoteJid, {
        text: `Gagal mengirim group ${groupName}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
