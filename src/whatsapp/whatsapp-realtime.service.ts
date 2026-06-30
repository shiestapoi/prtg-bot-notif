/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { BehaviorSubject, type Observable } from 'rxjs';
import type { WhatsappStatusResponse } from './whatsapp.types';

const initialStatus: WhatsappStatusResponse = {
  sessionName: 'haruyaki',
  status: 'idle',
  qr: null,
  qrDataUrl: null,
  isNewLogin: false,
  receivedPendingNotifications: false,
  me: null,
  lastDisconnect: null,
  isConnected: false,
  hasQr: false,
};

@Injectable()
export class WhatsappRealtimeService {
  private readonly statusSubject = new BehaviorSubject<WhatsappStatusResponse>(
    initialStatus,
  );

  publish(status: WhatsappStatusResponse) {
    this.statusSubject.next(status);
  }

  getStatusStream(): Observable<WhatsappStatusResponse> {
    return this.statusSubject.asObservable();
  }
}
