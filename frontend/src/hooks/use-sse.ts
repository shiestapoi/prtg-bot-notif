import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonitoringStatusEvent, MonitoringEvent, NocStatusEvent, PingStatusEvent } from '../lib/types';

export interface UseSSEOptions {
  /** Maximum number of events to keep in the buffer. Default: 50 */
  maxEvents?: number;
  /** Reconnect delay in ms after disconnect. Default: 3000 */
  reconnectDelay?: number;
  /** Maximum reconnect attempts before giving up. Default: 10 */
  maxReconnectAttempts?: number;
}

export interface UseSSEReturn {
  /** Array of received SSE events (most recent first) */
  events: NocStatusEvent[];
  /** Whether the EventSource connection is currently open */
  isConnected: boolean;
  /** Last connection error, if any */
  error: Error | null;
  /** Manually clear the events buffer */
  clearEvents: () => void;
}

/**
 * Hook for connecting to the NOC Server-Sent Events endpoint.
 * Automatically reconnects on disconnect with exponential backoff.
 */
export function useSSE(
  url: string = '/api/noc/events',
  options: UseSSEOptions = {},
): UseSSEReturn {
  const {
    maxEvents = 50,
    reconnectDelay = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const [events, setEvents] = useState<NocStatusEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const connect = useCallback(() => {
    // Don't connect if unmounted
    if (!mountedRef.current) return;

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
      reconnectAttemptRef.current = 0;
    };

    eventSource.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data) as NocStatusEvent;
        setEvents((prev) => [parsed, ...prev].slice(0, maxEvents));
      } catch (e) {
        setError(
          e instanceof Error ? e : new Error('Failed to parse SSE data'),
        );
      }
    };

    eventSource.onerror = () => {
      if (!mountedRef.current) return;

      setIsConnected(false);
      eventSource.close();
      eventSourceRef.current = null;

      // Attempt reconnect with backoff
      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const delay =
          reconnectDelay * Math.pow(1.5, reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;

        setError(
          new Error(
            `SSE disconnected. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})...`,
          ),
        );

        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, delay);
      } else {
        setError(
          new Error(
            `SSE connection failed after ${maxReconnectAttempts} attempts. Please refresh the page.`,
          ),
        );
      }
    };
  }, [url, maxEvents, reconnectDelay, maxReconnectAttempts]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      // Clean up EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Clean up reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  return { events, isConnected, error, clearEvents };
}

// ─── Monitoring SSE Hook ────────────────────────────────────────────────────

export interface UseMonitoringSSEOptions {
  /** Maximum number of events to keep in the buffer. Default: 50 */
  maxEvents?: number;
  /** Reconnect delay in ms after disconnect. Default: 3000 */
  reconnectDelay?: number;
  /** Maximum reconnect attempts before giving up. Default: 10 */
  maxReconnectAttempts?: number;
}

export interface UseMonitoringSSEReturn {
  /** Array of received monitoring SSE events (most recent first) */
  events: MonitoringStatusEvent[];
  /** Whether the EventSource connection is currently open */
  isConnected: boolean;
  /** Last connection error, if any */
  error: Error | null;
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonitoringStatusEvent, MonitoringEvent, NocStatusEvent, PingStatusEvent, PingLogEvent } from '../lib/types';

export interface UseSSEOptions {
  /** Maximum number of events to keep in the buffer. Default: 50 */
  maxEvents?: number;
  /** Reconnect delay in ms after disconnect. Default: 3000 */
  reconnectDelay?: number;
  /** Maximum reconnect attempts before giving up. Default: 10 */
  maxReconnectAttempts?: number;
}

export interface UseSSEReturn {
  /** Array of received SSE events (most recent first) */
  events: NocStatusEvent[];
  /** Whether the EventSource connection is currently open */
  isConnected: boolean;
  /** Last connection error, if any */
  error: Error | null;
  /** Manually clear the events buffer */
  clearEvents: () => void;
}

/**
 * Hook for connecting to the NOC Server-Sent Events endpoint.
 * Automatically reconnects on disconnect with exponential backoff.
 */
export function useSSE(
  url: string = '/api/noc/events',
  options: UseSSEOptions = {},
): UseSSEReturn {
  const {
    maxEvents = 50,
    reconnectDelay = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const [events, setEvents] = useState<NocStatusEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const connect = useCallback(() => {
    // Don't connect if unmounted
    if (!mountedRef.current) return;

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
      reconnectAttemptRef.current = 0;
    };

    eventSource.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data) as NocStatusEvent;
        setEvents((prev) => [parsed, ...prev].slice(0, maxEvents));
      } catch (e) {
        setError(
          e instanceof Error ? e : new Error('Failed to parse SSE data'),
        );
      }
    };

    eventSource.onerror = () => {
      if (!mountedRef.current) return;

      setIsConnected(false);
      eventSource.close();
      eventSourceRef.current = null;

      // Attempt reconnect with backoff
      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const delay =
          reconnectDelay * Math.pow(1.5, reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;

        setError(
          new Error(
            `SSE disconnected. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})...`,
          ),
        );

        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, delay);
      } else {
        setError(
          new Error(
            `SSE connection failed after ${maxReconnectAttempts} attempts. Please refresh the page.`,
          ),
        );
      }
    };
  }, [url, maxEvents, reconnectDelay, maxReconnectAttempts]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      // Clean up EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Clean up reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  return { events, isConnected, error, clearEvents };
}

// ─── Monitoring SSE Hook ────────────────────────────────────────────────────

export interface UseMonitoringSSEOptions {
  /** Maximum number of events to keep in the buffer. Default: 50 */
  maxEvents?: number;
  /** Reconnect delay in ms after disconnect. Default: 3000 */
  reconnectDelay?: number;
  /** Maximum reconnect attempts before giving up. Default: 10 */
  maxReconnectAttempts?: number;
}

export interface UseMonitoringSSEReturn {
  /** Array of received monitoring SSE events (most recent first) */
  events: MonitoringStatusEvent[];
  /** Whether the EventSource connection is currently open */
  isConnected: boolean;
  /** Last connection error, if any */
  error: Error | null;
  /** Manually clear the events buffer */
  clearEvents: () => void;
}

/**
 * Hook for connecting to the unified Monitoring SSE endpoint.
 * Connects to `/api/monitoring/events` and parses MonitoringStatusEvent messages.
 * Automatically reconnects on disconnect with exponential backoff.
 */
export function useMonitoringSSE(
  onStatusChange?: (event: MonitoringStatusEvent) => void,
  options: UseMonitoringSSEOptions & { 
    onConfigUpdated?: () => void; 
    onPingStatus?: (event: PingStatusEvent) => void;
    onPingLog?: (event: PingLogEvent) => void;
  } = {},
): UseMonitoringSSEReturn {
  const {
    maxEvents = 50,
    reconnectDelay = 3000,
    maxReconnectAttempts = 10,
    onConfigUpdated,
    onPingStatus,
    onPingLog,
  } = options;

  const [events, setEvents] = useState<MonitoringStatusEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onStatusChangeRef = useRef(onStatusChange);
  const onConfigUpdatedRef = useRef(onConfigUpdated);
  const onPingStatusRef = useRef(onPingStatus);
  const onPingLogRef = useRef(onPingLog);

  // Keep callback ref up to date without triggering reconnects
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onConfigUpdatedRef.current = onConfigUpdated;
    onPingStatusRef.current = onPingStatus;
    onPingLogRef.current = onPingLog;
  }, [onStatusChange, onConfigUpdated, onPingStatus, onPingLog]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const connect = useCallback(() => {
    // Don't connect if unmounted
    if (!mountedRef.current) return;

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource('/api/monitoring/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
      reconnectAttemptRef.current = 0;
    };

    eventSource.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data) as MonitoringEvent;
        if (parsed.type === 'status_change') {
          setEvents((prev) => [parsed, ...prev].slice(0, maxEvents));
          onStatusChangeRef.current?.(parsed);
        } else if (parsed.type === 'config_updated') {
          onConfigUpdatedRef.current?.();
        } else if (parsed.type === 'ping_status') {
          onPingStatusRef.current?.(parsed);
        } else if (parsed.type === 'ping_log') {
          onPingLogRef.current?.(parsed);
        }
      } catch (e) {
        setError(
          e instanceof Error ? e : new Error('Failed to parse SSE data'),
        );
      }
    };

    eventSource.onerror = () => {
      if (!mountedRef.current) return;

      setIsConnected(false);
      eventSource.close();
      eventSourceRef.current = null;

      // Attempt reconnect with backoff
      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const delay =
          reconnectDelay * Math.pow(1.5, reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;

        setError(
          new Error(
            `SSE disconnected. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})...`,
          ),
        );

        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, delay);
      } else {
        setError(
          new Error(
            `SSE connection failed after ${maxReconnectAttempts} attempts. Please refresh the page.`,
          ),
        );
      }
    };
  }, [maxEvents, reconnectDelay, maxReconnectAttempts]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      // Clean up EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Clean up reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  return { events, isConnected, error, clearEvents };
}
