import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMonitoringSSE } from '@/hooks/use-sse';
import { monitoringApi } from '@/lib/api';
import type { MonitoringSummaryItem, MonitoringStatusEvent, NocStatus } from '@/lib/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBitrate(bitrate: number | null | undefined): string {
  if (bitrate == null) return '—';
  const mbit = bitrate / 1_000_000;
  return `${mbit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' });
}

/** Format duration from a date string to now (e.g., "2j 15m") */
function formatDuration(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return '';
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 1) return '<1m';
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}j ${mins}m`;
  return `${mins}m`;
}

/** Event ticker entry */
interface TickerEvent {
  id: string;
  text: string;
  timestamp: number;
}

/** Priority for sorting — lower number = more critical = shown first */
const STATUS_PRIORITY: Record<NocStatus, number> = {
  DOWN: 0,
  NO_TRAFFIC: 1,
  POSSIBLE_FLAPPING: 2,
  HIGH_UTILIZATION: 3,
  LOW_TRAFFIC: 4,
  NORMAL: 5,
};

const STATUS_COLORS: Record<NocStatus, string> = {
  DOWN: 'bg-red-600 text-white animate-pulse',
  NO_TRAFFIC: 'bg-red-500 text-white',
  POSSIBLE_FLAPPING: 'bg-orange-500 text-white',
  HIGH_UTILIZATION: 'bg-yellow-500 text-black',
  LOW_TRAFFIC: 'bg-yellow-400 text-black',
  NORMAL: 'bg-green-600 text-white',
};

const STATUS_CARD_BORDER: Record<NocStatus, string> = {
  DOWN: 'border-red-500 ring-2 ring-red-500/50',
  NO_TRAFFIC: 'border-red-400',
  POSSIBLE_FLAPPING: 'border-orange-400',
  HIGH_UTILIZATION: 'border-yellow-400',
  LOW_TRAFFIC: 'border-yellow-300',
  NORMAL: 'border-gray-700',
};

// ─── Wake Lock (prevent screen sleep) ───────────────────────────────────────

function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isActive, setIsActive] = useState(false);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setIsActive(true);
      wakeLockRef.current.addEventListener('release', () => {
        setIsActive(false);
      });
    } catch {
      // Wake Lock request failed (e.g., low battery)
      setIsActive(false);
    }
  }, []);

  // Request wake lock on mount and re-acquire when page becomes visible again
  useEffect(() => {
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [requestWakeLock]);

  return { isWakeLockActive: isActive };
}

// ─── Fullscreen ─────────────────────────────────────────────────────────────

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  return { isFullscreen, toggleFullscreen };
}

// ─── Alert Sound ────────────────────────────────────────────────────────────

type AlarmType = 'siren' | 'beep' | 'klaxon';

const ALARM_FILES: Record<AlarmType, string> = {
  siren: '/sounds/siren.wav',
  beep: '/sounds/beep.wav',
  klaxon: '/sounds/klaxon.wav',
};

function useAlertSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [alarmType, setAlarmType] = useState<AlarmType>('beep');

  /** Play the selected alarm sound file for ~5 seconds */
  const playAlarm = useCallback(() => {
    // Stop any currently playing sound
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const audio = new Audio(ALARM_FILES[alarmType]);
    audio.volume = 0.7;
    audioRef.current = audio;
    audio.play().catch(() => {
      // Browser blocked autoplay — user hasn't interacted yet
    });
  }, [alarmType]);

  const stopAlarm = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return { playAlarm, stopAlarm, alarmType, setAlarmType };
}

// ─── TV Dashboard Page ──────────────────────────────────────────────────────

export default function NocTvDashboardPage() {
  const [items, setItems] = useState<MonitoringSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [spotlightEnabled, setSpotlightEnabled] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [tickerEvents, setTickerEvents] = useState<TickerEvent[]>([]);
  const { playAlarm, alarmType, setAlarmType } = useAlertSound();
  const { isWakeLockActive } = useWakeLock();
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  // ─── Auto-reload on prolonged disconnect ────────────────────────────────
  const disconnectedSinceRef = useRef<number | null>(null);

  // SSE for real-time updates
  const onStatusChange = useCallback((event: MonitoringStatusEvent) => {
    setItems((prev) =>
      prev.map((item) =>
        item.configId === event.configId
          ? { ...item, lastStatus: event.currentStatus, lastPolledAt: event.timestamp, lastMetric: event.metric }
          : item,
      ),
    );

    // Add to ticker
    const timeStr = new Date(event.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    let tickerText = '';
    if (event.currentStatus === 'DOWN' || event.currentStatus === 'NO_TRAFFIC') {
      tickerText = `${timeStr} — ${event.configTitle} [${event.groupName}] went ${event.currentStatus.replace('_', ' ')}`;
    } else if (event.currentStatus === 'NORMAL' && event.previousStatus !== 'NORMAL') {
      tickerText = `${timeStr} — ${event.configTitle} [${event.groupName}] recovered ✓`;
    } else if (event.currentStatus !== 'NORMAL') {
      tickerText = `${timeStr} — ${event.configTitle} [${event.groupName}] → ${event.currentStatus.replace('_', ' ')}`;
    }
    if (tickerText) {
      setTickerEvents((prev) => [{ id: `${event.configId}-${event.timestamp}`, text: tickerText, timestamp: Date.now() }, ...prev].slice(0, 20));
    }

    // Play alert sound on new DOWN event
    if (event.currentStatus === 'DOWN' && event.previousStatus !== 'DOWN' && soundEnabled) {
      playAlarm();
    }
  }, [soundEnabled, playAlarm]);

  const { isConnected } = useMonitoringSSE(onStatusChange);

  // Auto-reload if disconnected for more than 30 seconds
  useEffect(() => {
    if (!isConnected) {
      if (disconnectedSinceRef.current === null) {
        disconnectedSinceRef.current = Date.now();
      }
    } else {
      disconnectedSinceRef.current = null;
    }
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) {
      const timer = setInterval(() => {
        if (disconnectedSinceRef.current && Date.now() - disconnectedSinceRef.current > 30000) {
          window.location.reload();
        }
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [isConnected]);

  // Clock update every second
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial data only (real-time updates via SSE)
  useEffect(() => {
    let cancelled = false;
    async function fetchSummary() {
      try {
        const data = await monitoringApi.summary();
        if (!cancelled) { setItems(data); }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchSummary();
    return () => { cancelled = true; };
  }, []);

  // Play alarm when DOWN is first detected (effect runs after hasDown is computed below)
  const prevHasDownRef = useRef(false);

  // Sort items: DOWN first, then by status priority
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const pa = STATUS_PRIORITY[a.lastStatus] ?? 5;
      const pb = STATUS_PRIORITY[b.lastStatus] ?? 5;
      if (pa !== pb) return pa - pb;
      return a.title.localeCompare(b.title);
    });
  }, [items]);

  const downCount = useMemo(() => items.filter((i) => i.lastStatus === 'DOWN' || i.lastStatus === 'NO_TRAFFIC').length, [items]);
  const normalCount = useMemo(() => items.filter((i) => i.lastStatus === 'NORMAL').length, [items]);
  const warningCount = useMemo(() => items.length - downCount - normalCount, [items, downCount, normalCount]);

  // Group list for filter tabs
  const groups = useMemo(() => {
    const set = new Set(items.map((i) => i.groupName));
    return ['ALL', ...Array.from(set).sort()];
  }, [items]);

  // Filter items by selected group
  const filteredItems = useMemo(() => {
    if (selectedGroup === 'ALL') return sortedItems;
    return sortedItems.filter((i) => i.groupName === selectedGroup);
  }, [sortedItems, selectedGroup]);

  // Adaptive grid columns based on item count
  const gridCols = useMemo(() => {
    const count = filteredItems.length;
    if (count <= 4) return 'grid-cols-2';
    if (count <= 9) return 'grid-cols-3';
    if (count <= 16) return 'grid-cols-4';
    return 'grid-cols-5';
  }, [filteredItems.length]);

  // Enable sound on first user interaction (satisfies browser autoplay policy)
  const handleEnableSound = () => {
    setHasInteracted(true);
    setSoundEnabled(true);
  };

  // ─── Auto-rotate Spotlight ──────────────────────────────────────────────
  // Normal mode: cycle ALL items sorted by lowest traffic, 3s each.
  // If any status changes to warning (LOW_TRAFFIC etc) → reset to start.
  // DOWN mode: only show DOWN/NO_TRAFFIC items, 10s each.
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [spotlightVisible, setSpotlightVisible] = useState(false);

  const hasDown = useMemo(() => items.some((i) => i.lastStatus === 'DOWN' || i.lastStatus === 'NO_TRAFFIC'), [items]);

  // Play alarm when DOWN is first detected
  useEffect(() => {
    if (hasDown && !prevHasDownRef.current && soundEnabled) {
      playAlarm();
    }
    prevHasDownRef.current = hasDown;
  }, [hasDown, soundEnabled, playAlarm]);

  // Items for normal rotation (all items, sorted by lowest traffic)
  const normalSpotlightItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aTraffic = a.lastMetric?.totalTrafficBitrate ?? 0;
      const bTraffic = b.lastMetric?.totalTrafficBitrate ?? 0;
      return aTraffic - bTraffic;
    });
  }, [items]);

  // Items for DOWN mode (only DOWN/NO_TRAFFIC items)
  const downSpotlightItems = useMemo(() => {
    return items.filter((i) => i.lastStatus === 'DOWN' || i.lastStatus === 'NO_TRAFFIC');
  }, [items]);

  // Active spotlight list and duration based on mode
  const spotlightItems = hasDown ? downSpotlightItems : normalSpotlightItems;
  const spotlightDuration = hasDown ? 10000 : 3000;

  // Reset index when switching between normal/down mode or when a warning appears
  const prevHasDownForSpotlight = useRef(hasDown);
  const prevWarningCount = useRef(warningCount);

  useEffect(() => {
    // Reset on mode switch (normal ↔ down)
    if (prevHasDownForSpotlight.current !== hasDown) {
      setSpotlightIndex(0);
      prevHasDownForSpotlight.current = hasDown;
    }
    // Reset when warning count increases (new LOW_TRAFFIC detected)
    if (!hasDown && warningCount > prevWarningCount.current) {
      setSpotlightIndex(0);
    }
    prevWarningCount.current = warningCount;
  }, [hasDown, warningCount]);

  useEffect(() => {
    if (!spotlightEnabled || spotlightItems.length === 0) {
      setSpotlightVisible(false);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setSpotlightVisible(true);
      timer = setTimeout(() => {
        setSpotlightVisible(false);
        timer = setTimeout(() => {
          setSpotlightIndex((prev) => (prev + 1) % spotlightItems.length);
        }, 1000); // 1s gap
      }, spotlightDuration);
    };

    cycle();
    return () => clearTimeout(timer);
  }, [spotlightIndex, spotlightEnabled, spotlightItems.length, spotlightDuration]);

  const spotlightItem = spotlightItems[spotlightIndex] ?? null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-2xl animate-pulse">Loading NOC Dashboard...</div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen text-white p-2 select-none text-[12px] transition-colors duration-700 ${hasDown ? 'bg-gray-950 bg-gradient-to-br from-red-950/30 to-gray-950' : 'bg-gray-950'}`}
      onClick={() => { if (!hasInteracted) handleEnableSound(); }}
    >
      {/* Connection Lost Overlay */}
      {!isConnected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-4xl mb-3 animate-pulse">📡</div>
            <h2 className="text-xl font-bold text-red-400 mb-1">CONNECTION LOST</h2>
            <p className="text-sm text-gray-400">Reconnecting... Auto-reload dalam 30 detik</p>
          </div>
        </div>
      )}

      {/* Header Bar — always on top */}
      <header className="sticky top-0 z-[60] flex items-center justify-between mb-2 px-1 py-1 bg-gray-950/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold tracking-tight">PRTG MONITORING</h1>
          <div className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[10px] text-gray-400">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${isWakeLockActive ? 'bg-cyan-400' : 'bg-gray-600'}`} />
            <span className="text-[10px] text-gray-400">{isWakeLockActive ? 'AWAKE' : 'NO LOCK'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Summary */}
          <div className="flex items-center gap-2 text-[10px]">
            {downCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 font-bold animate-pulse">
                🔴 {downCount} DOWN
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-yellow-500 px-2 py-0.5 font-bold text-black">
                ⚠️ {warningCount}
              </span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 font-bold">
              ✅ {normalCount}
            </span>
          </div>

          {/* Fullscreen Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            className="rounded bg-gray-700 hover:bg-gray-600 px-2 py-1 text-[10px] font-medium transition"
          >
            {isFullscreen ? '⬜ Exit' : '⛶ Full'}
          </button>

          {/* Spotlight Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setSpotlightEnabled(!spotlightEnabled); }}
            className={`rounded px-2 py-1 text-[10px] font-medium transition ${spotlightEnabled ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            {spotlightEnabled ? '📺 Rotate ON' : '📺 Rotate OFF'}
          </button>

          {/* Alarm Type Selector — cycle button (TV-friendly, no dropdown) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const types: AlarmType[] = ['siren', 'beep', 'klaxon'];
              const currentIdx = types.indexOf(alarmType);
              setAlarmType(types[(currentIdx + 1) % types.length]);
            }}
            className="rounded bg-gray-700 hover:bg-gray-600 px-2 py-1 text-[10px] font-medium transition"
          >
            {alarmType === 'siren' ? '🚨 Siren' : alarmType === 'beep' ? '🔔 Beep' : '📢 Klaxon'}
          </button>

          {/* Sound Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setSoundEnabled(!soundEnabled); setHasInteracted(true); }}
            className={`rounded px-2 py-1 text-[10px] font-medium transition ${soundEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            {soundEnabled ? '🔊 ON' : '🔇 OFF'}
          </button>

          {/* Test Alarm */}
          <button
            onClick={(e) => { e.stopPropagation(); setHasInteracted(true); playAlarm(); }}
            className="rounded bg-red-700 hover:bg-red-600 px-2 py-1 text-[10px] font-medium transition"
          >
            🚨 Test
          </button>

          {/* Clock */}
          <div className="text-right">
            <div className="text-sm font-mono font-bold tabular-nums">
              {clock.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' })}
            </div>
            <div className="text-[9px] text-gray-400">
              {clock.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })}
            </div>
          </div>
        </div>
      </header>

      {/* Sound Enable Prompt */}
      {!hasInteracted && (
        <div className="mb-2 rounded bg-blue-900/50 border border-blue-500 p-2 text-center text-[10px] text-blue-200">
          Klik di mana saja untuk mengaktifkan alert sound
        </div>
      )}

      {/* Group Filter Tabs */}
      {groups.length > 2 && (
        <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-1">
          {groups.map((group) => (
            <button
              key={group}
              onClick={(e) => { e.stopPropagation(); setSelectedGroup(group); }}
              className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition ${selectedGroup === group ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {group}
            </button>
          ))}
        </div>
      )}

      {/* Grid of Cards — adaptive columns */}
      <div className={`grid ${gridCols} gap-2`}>
        {filteredItems.map((item) => (
          <TvCard key={item.configId} item={item} now={clock} />
        ))}
      </div>

      {/* Event Ticker — bottom bar */}
      {tickerEvents.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[55] bg-gray-900/95 border-t border-gray-800 px-3 py-1.5 overflow-hidden">
          <div className="flex items-center gap-4 animate-ticker">
            {tickerEvents.slice(0, 10).map((evt) => (
              <span key={evt.id} className="shrink-0 text-[10px] text-gray-300">
                {evt.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spotlight Overlay — auto-rotate detail */}
      {spotlightEnabled && spotlightItem && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-500 ${spotlightVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className={`w-[70vw] max-w-4xl rounded-xl bg-gray-900 border ${hasDown ? 'border-red-500' : 'border-gray-700'} p-4 shadow-2xl transition-all duration-500 ${spotlightVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold">{spotlightItem.title}</h2>
                <p className="text-xs text-gray-400">{spotlightItem.groupName}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${STATUS_COLORS[spotlightItem.lastStatus]}`}>
                  {spotlightItem.lastStatus}
                </span>
                <span className="text-[10px] text-gray-500">
                  {spotlightIndex + 1}/{spotlightItems.length}
                </span>
              </div>
            </div>
            {/* Large Chart */}
            <div className="bg-white rounded-lg p-2 mb-3">
              <img
                src={`/api/monitoring/chart/${spotlightItem.sensorId}?t=${spotlightItem.lastPolledAt ?? ''}`}
                alt={spotlightItem.title}
                className="w-full h-auto rounded"
              />
            </div>
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-[10px] text-gray-500 uppercase">Total Traffic</div>
                <div className="text-base font-bold">{formatBitrate(spotlightItem.lastMetric?.totalTrafficBitrate)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase">Inbound</div>
                <div className="text-base font-bold text-green-400">{formatBitrate(spotlightItem.lastMetric?.inboundBitrate)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase">Outbound</div>
                <div className="text-base font-bold text-blue-400">{formatBitrate(spotlightItem.lastMetric?.outboundBitrate)}</div>
              </div>
            </div>
            {/* Progress bar — key resets animation on each new item */}
            <div className="mt-3 h-1 rounded-full bg-gray-800 overflow-hidden">
              {spotlightVisible && (
                <div key={spotlightIndex} className={`h-full rounded-full ${hasDown ? 'bg-red-500' : 'bg-green-500'}`} style={{ animation: `shrink ${spotlightDuration / 1000}s linear forwards` }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes shrink { from { width: 100%; } to { width: 0%; } }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-ticker { animation: ticker 30s linear infinite; }
      `}</style>
    </div>
  );
}

// ─── TV Card ────────────────────────────────────────────────────────────────

function TvCard({ item, now }: { item: MonitoringSummaryItem; now: Date }) {
  const [imgError, setImgError] = useState(false);
  const prevPolledAtRef = useRef(item.lastPolledAt);
  const [cachedChartUrl, setCachedChartUrl] = useState(`/api/monitoring/chart/${item.sensorId}?t=${item.lastPolledAt ?? ''}`);

  // Only update chart URL when lastPolledAt actually changes (image caching)
  useEffect(() => {
    if (item.lastPolledAt !== prevPolledAtRef.current) {
      prevPolledAtRef.current = item.lastPolledAt;
      setCachedChartUrl(`/api/monitoring/chart/${item.sensorId}?t=${item.lastPolledAt ?? ''}`);
      setImgError(false);
    }
  }, [item.lastPolledAt, item.sensorId]);

  const isDown = item.lastStatus === 'DOWN' || item.lastStatus === 'NO_TRAFFIC';
  const duration = formatDuration(item.lastPolledAt);
  // Suppress unused var warning — now is used to trigger re-render for duration
  void now;

  return (
    <div className={`rounded-lg border ${STATUS_CARD_BORDER[item.lastStatus]} bg-gray-900 overflow-hidden transition-all ${isDown ? 'shadow-md shadow-red-500/20' : ''}`}>
      {/* Title + Status */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-800">
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-semibold truncate" title={item.title}>{item.title}</h3>
          <p className="text-[9px] text-gray-500">{item.groupName}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${STATUS_COLORS[item.lastStatus]}`}>
            {item.lastStatus.replace('_', ' ')}
          </span>
          {item.lastStatus !== 'NORMAL' && duration && (
            <span className="text-[8px] text-gray-400">{duration}</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white p-0.5 mx-1 mt-1 rounded">
        {!imgError ? (
          <img
            src={cachedChartUrl}
            alt={item.title}
            className="w-full h-auto rounded"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-10 items-center justify-center text-[8px] text-gray-400">No chart</div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-0.5 px-2 py-1 text-center">
        <div>
          <div className="text-[8px] text-gray-500 uppercase">Total</div>
          <div className="text-[10px] font-bold">{formatBitrate(item.lastMetric?.totalTrafficBitrate)}</div>
        </div>
        <div>
          <div className="text-[8px] text-gray-500 uppercase">In</div>
          <div className="text-[10px] font-bold text-green-400">{formatBitrate(item.lastMetric?.inboundBitrate)}</div>
        </div>
        <div>
          <div className="text-[8px] text-gray-500 uppercase">Out</div>
          <div className="text-[10px] font-bold text-blue-400">{formatBitrate(item.lastMetric?.outboundBitrate)}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-2 pb-1 text-[8px] text-gray-500 text-right">
        {formatTime(item.lastPolledAt)}
      </div>
    </div>
  );
}
