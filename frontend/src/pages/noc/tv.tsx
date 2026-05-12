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
  const [spotlightEnabled, setSpotlightEnabled] = useState(true);
  const { playAlarm, alarmType, setAlarmType } = useAlertSound();

  // SSE for real-time updates
  const onStatusChange = useCallback((event: MonitoringStatusEvent) => {
    setItems((prev) =>
      prev.map((item) =>
        item.configId === event.configId
          ? { ...item, lastStatus: event.currentStatus, lastPolledAt: event.timestamp, lastMetric: event.metric }
          : item,
      ),
    );

    // Play alert sound on new DOWN event (5 seconds)
    if (event.currentStatus === 'DOWN' && event.previousStatus !== 'DOWN' && soundEnabled) {
      playAlarm();
    }
  }, [soundEnabled, playAlarm]);

  const { isConnected } = useMonitoringSSE(onStatusChange);

  // Clock update every second
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial data + auto-refresh every 15 seconds
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
    const interval = setInterval(fetchSummary, 15000);
    return () => { cancelled = true; clearInterval(interval); };
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

  // Enable sound on first user interaction
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
      className="min-h-screen bg-gray-950 text-white p-2 select-none text-[12px]"
      onClick={() => { if (!hasInteracted) handleEnableSound(); }}
    >
      {/* Header Bar — always on top */}
      <header className="sticky top-0 z-[60] flex items-center justify-between mb-2 px-1 py-1 bg-gray-950/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold tracking-tight">PRTG MONITORING</h1>
          <div className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[10px] text-gray-400">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
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

          {/* Spotlight Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setSpotlightEnabled(!spotlightEnabled); }}
            className={`rounded px-2 py-1 text-[10px] font-medium transition ${spotlightEnabled ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            {spotlightEnabled ? '📺 Rotate ON' : '📺 Rotate OFF'}
          </button>

          {/* Alarm Type Selector */}
          <select
            value={alarmType}
            onChange={(e) => { e.stopPropagation(); setAlarmType(e.target.value as 'siren' | 'beep' | 'klaxon'); }}
            className="rounded bg-gray-700 px-1.5 py-1 text-[10px] font-medium text-white border-none outline-none cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="siren">🚨 Siren</option>
            <option value="beep">🔔 Beep</option>
            <option value="klaxon">📢 Klaxon</option>
          </select>

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

      {/* Grid of Cards — 4 columns for TV */}
      <div className="grid grid-cols-4 gap-2">
        {sortedItems.map((item) => (
          <TvCard key={item.configId} item={item} />
        ))}
      </div>

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

      {/* Spotlight progress bar animation */}
      <style>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  );
}

// ─── TV Card ────────────────────────────────────────────────────────────────

function TvCard({ item }: { item: MonitoringSummaryItem }) {
  const [imgError, setImgError] = useState(false);
  const chartUrl = `/api/monitoring/chart/${item.sensorId}?t=${item.lastPolledAt ?? ''}`;
  const isDown = item.lastStatus === 'DOWN' || item.lastStatus === 'NO_TRAFFIC';

  return (
    <div className={`rounded-lg border ${STATUS_CARD_BORDER[item.lastStatus]} bg-gray-900 overflow-hidden transition-all ${isDown ? 'shadow-md shadow-red-500/20' : ''}`}>
      {/* Title + Status */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-800">
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-semibold truncate" title={item.title}>{item.title}</h3>
          <p className="text-[9px] text-gray-500">{item.groupName}</p>
        </div>
        <span className={`ml-1 shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${STATUS_COLORS[item.lastStatus]}`}>
          {item.lastStatus.replace('_', ' ')}
        </span>
      </div>

      {/* Chart */}
      <div className="bg-white p-0.5 mx-1 mt-1 rounded">
        {!imgError ? (
          <img
            src={chartUrl}
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
