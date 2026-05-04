import { helloPlugin } from './hello.plugin';
import { pingPlugin } from './ping.plugin';
import type { WhatsappPlugin } from './whatsapp-plugin';

export const whatsappPlugins: WhatsappPlugin[] = [helloPlugin, pingPlugin];
