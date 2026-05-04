import type { WhatsappPlugin } from './whatsapp-plugin';

export const pingPlugin: WhatsappPlugin = {
  name: 'ping-plugin',

  canHandle({ text }) {
    return text?.trim().toLowerCase() === 'ping';
  },

  async handle({ sendMessage, remoteJid, message, logger }) {
    logger.log(`ping-plugin matched message from ${remoteJid}`);

    await sendMessage(remoteJid, { text: 'pong' }, { quoted: message });
  },
};
