import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  MonitoringEventService,
  MonitoringStatusEvent,
} from '../scheduler/monitoring-event.service';

/**
 * MonitoringEventController exposes a Server-Sent Events (SSE) endpoint for
 * real-time monitoring status updates. Clients connect to GET /api/monitoring/events
 * and receive MonitoringStatusEvent payloads whenever a monitored config's status
 * changes.
 */
@Controller('api/monitoring/events')
export class MonitoringEventController {
  constructor(
    private readonly monitoringEventService: MonitoringEventService,
  ) {}

  /**
   * SSE endpoint streaming real-time monitoring status change events.
   * Each event contains the config ID, title, group name, previous/current status,
   * timestamp, and the associated metric snapshot.
   *
   * The connection is kept alive until the client disconnects.
   * On disconnection, the subscription to the event service is cleaned up.
   */
  @Sse()
  events(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.monitoringEventService.subscribe(
        (event: MonitoringStatusEvent) => {
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
