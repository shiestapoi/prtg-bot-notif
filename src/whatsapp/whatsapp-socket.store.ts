import { Injectable } from '@nestjs/common';
import type { WASocket } from 'baileys';

@Injectable()
export class WhatsappSocketStore {
  private socket: WASocket | null = null;

  setSocket(socket: WASocket | null) {
    this.socket = socket;
  }

  getSocket(): WASocket | null {
    return this.socket;
  }
}
