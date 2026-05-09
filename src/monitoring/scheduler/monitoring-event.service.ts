import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { NocStatus } from '@prisma/client';

/**
 * SSE event payload broadcast when a monitoring-enabled config's status changes.
 */
export interface MonitoringStatusEvent {
  type: 'status_change';
  configId: number;
  configTitle: string;
  groupName: string;
  previousStatus: NocStatus;
  currentStatus: NocStatus;
  timestamp: string;
  metric: {
    totalTrafficBitrate: number | null;
    inboundBitrate: number | null;
    outboundBitrate: number | null;
  } | null;
}

/**
 * Simple EventEmitter-based service for broadcasting monitoring status events.
 * Controllers can subscribe to receive real-time updates for SSE streaming.
 */
@Injectable()
export class MonitoringEventService {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Allow many listeners (one per SSE client connection)
    this.emitter.setMaxListeners(100);
  }

  /**
   * Emit a status change event to all subscribers.
   */
  emit(event: MonitoringStatusEvent): void {
    this.emitter.emit('status_change', event);
  }

  /**
   * Subscribe to status change events.
   * Returns an unsubscribe function.
   */
  subscribe(listener: (event: MonitoringStatusEvent) => void): () => void {
    this.emitter.on('status_change', listener);
    return () => {
      this.emitter.off('status_change', listener);
    };
  }
}
