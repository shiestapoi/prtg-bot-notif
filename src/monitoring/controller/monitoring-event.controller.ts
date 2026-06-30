/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  MonitoringEventService,
  type MonitoringEvent,
} from '../scheduler/monitoring-event.service';

/**
 * MonitoringEventController exposes a Server-Sent Events (SSE) endpoint for
 * real-time monitoring status updates. Clients connect to GET /api/monitoring/events
 * and receive MonitoringStatusEvent or ConfigUpdatedEvent payloads.
 */
@Controller('api/monitoring/events')
export class MonitoringEventController {
  constructor(
    private readonly monitoringEventService: MonitoringEventService,
  ) {}

  @Sse()
  events(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.monitoringEventService.subscribe(
        (event: MonitoringEvent) => {
          subscriber.next({ data: event });
        },
      );

      // Cleanup when client disconnects
      return () => {
        unsubscribe();
      };
    });
  }
}
