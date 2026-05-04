import type { WhatsappPlugin } from './whatsapp-plugin';

export const helloPlugin: WhatsappPlugin = {
  name: 'hello-plugin',

  canHandle({ text }) {
    return text?.trim().toLowerCase() === 'hello';
  },

  async handle({ sendMessage, remoteJid, message, logger }) {
    logger.log(`hello-plugin matched message from ${remoteJid}`);

    await sendMessage(
      remoteJid,
      { text: 'Hello, how can I help?' },
      { quoted: message },
    );
  },
};
