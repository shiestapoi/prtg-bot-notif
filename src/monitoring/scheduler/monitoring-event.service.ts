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
  maintenance: boolean;
  metric: {
    totalTrafficBitrate: number | null;
    inboundBitrate: number | null;
    outboundBitrate: number | null;
  } | null;
}

/**
 * SSE event payload broadcast when a config is created, updated, or deleted.
 * The TV page uses this to re-fetch the full summary without manual reload.
 */
export interface ConfigUpdatedEvent {
  type: 'config_updated';
  action: 'created' | 'updated' | 'deleted';
  configId: number;
  timestamp: string;
}

export interface PingStatusEvent {
  type: 'ping_status';
  monitorId: number;
  name: string;
  host: string;
  status: 'UNKNOWN' | 'UP' | 'RTO';
  latencyMs: number | null;
  checkedAt: string;
  outageStartedAt: string | null;
  maintenance: boolean;
  maintenanceLabel: string | null;
}

export type MonitoringEvent = MonitoringStatusEvent | ConfigUpdatedEvent | PingStatusEvent;

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
    this.emitter.emit('monitoring_event', event);
  }

  /**
   * Emit a config updated event to all subscribers.
   */
  emitConfigUpdated(action: 'created' | 'updated' | 'deleted', configId: number): void {
    const event: ConfigUpdatedEvent = {
      type: 'config_updated',
      action,
      configId,
      timestamp: new Date().toISOString(),
    };
    this.emitter.emit('monitoring_event', event);
  }

  emitPing(event: PingStatusEvent): void {
    this.emitter.emit('monitoring_event', event);
  }

  /**
   * Subscribe to all monitoring events (status_change + config_updated).
   * Returns an unsubscribe function.
   */
  subscribe(listener: (event: MonitoringEvent) => void): () => void {
    this.emitter.on('monitoring_event', listener);
    return () => {
      this.emitter.off('monitoring_event', listener);
    };
  }
}
