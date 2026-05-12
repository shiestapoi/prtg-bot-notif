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
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  const [alarmType, setAlarmType] = useState<AlarmType>('siren');

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

  // Play alarm when DOWN is first detected
  const hasDown = useMemo(() => items.some((i) => i.lastStatus === 'DOWN' || i.lastStatus === 'NO_TRAFFIC'), [items]);
  const prevHasDownRef = useRef(false);

  useEffect(() => {
    // Only trigger alarm on transition from no-down to has-down
    if (hasDown && !prevHasDownRef.current && soundEnabled) {
      playAlarm();
    }
    prevHasDownRef.current = hasDown;
  }, [hasDown, soundEnabled, playAlarm]);

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-2xl animate-pulse">Loading NOC Dashboard...</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gray-950 text-white p-4 select-none"
      onClick={() => { if (!hasInteracted) handleEnableSound(); }}
    >
      {/* Header Bar */}
      <header className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">PRTG MONITORING</h1>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-sm text-gray-400">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Status Summary */}
          <div className="flex items-center gap-3 text-sm">
            {downCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 font-bold animate-pulse">
                🔴 {downCount} DOWN
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-yellow-500 px-3 py-1 font-bold text-black">
                ⚠️ {warningCount}
              </span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 font-bold">
              ✅ {normalCount}
            </span>
          </div>

          {/* Alarm Type Selector */}
          <select
            value={alarmType}
            onChange={(e) => { e.stopPropagation(); setAlarmType(e.target.value as 'siren' | 'beep' | 'klaxon'); }}
            className="rounded-lg bg-gray-700 px-2 py-1.5 text-sm font-medium text-white border-none outline-none cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="siren">🚨 Siren</option>
            <option value="beep">🔔 Beep</option>
            <option value="klaxon">📢 Klaxon</option>
          </select>

          {/* Sound Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setSoundEnabled(!soundEnabled); setHasInteracted(true); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${soundEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            {soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}
          </button>

          {/* Test Alarm */}
          <button
            onClick={(e) => { e.stopPropagation(); setHasInteracted(true); playAlarm(); }}
            className="rounded-lg bg-red-700 hover:bg-red-600 px-3 py-1.5 text-sm font-medium transition"
          >
            🚨 Test Alarm
          </button>

          {/* Clock */}
          <div className="text-right">
            <div className="text-2xl font-mono font-bold tabular-nums">
              {clock.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs text-gray-400">
              {clock.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      {/* Sound Enable Prompt */}
      {!hasInteracted && (
        <div className="mb-4 rounded-lg bg-blue-900/50 border border-blue-500 p-3 text-center text-sm text-blue-200">
          Klik di mana saja untuk mengaktifkan alert sound
        </div>
      )}

      {/* Grid of Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {sortedItems.map((item) => (
          <TvCard key={item.configId} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─── TV Card ────────────────────────────────────────────────────────────────

function TvCard({ item }: { item: MonitoringSummaryItem }) {
  const [imgError, setImgError] = useState(false);
  const chartUrl = `/api/monitoring/chart/${item.sensorId}?t=${item.lastPolledAt ?? ''}`;
  const isDown = item.lastStatus === 'DOWN' || item.lastStatus === 'NO_TRAFFIC';

  return (
    <div className={`rounded-xl border-2 ${STATUS_CARD_BORDER[item.lastStatus]} bg-gray-900 overflow-hidden transition-all ${isDown ? 'shadow-lg shadow-red-500/20' : ''}`}>
      {/* Title + Status */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate" title={item.title}>{item.title}</h3>
          <p className="text-[10px] text-gray-500">{item.groupName}</p>
        </div>
        <span className={`ml-2 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[item.lastStatus]}`}>
          {item.lastStatus.replace('_', ' ')}
        </span>
      </div>

      {/* Chart */}
      <div className="bg-white p-1 mx-2 mt-2 rounded">
        {!imgError ? (
          <img
            src={chartUrl}
            alt={item.title}
            className="w-full h-auto rounded"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-16 items-center justify-center text-[10px] text-gray-400">No chart</div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-1 px-3 py-2 text-center">
        <div>
          <div className="text-[9px] text-gray-500 uppercase">Total</div>
          <div className="text-xs font-bold">{formatBitrate(item.lastMetric?.totalTrafficBitrate)}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 uppercase">In</div>
          <div className="text-xs font-bold text-green-400">{formatBitrate(item.lastMetric?.inboundBitrate)}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 uppercase">Out</div>
          <div className="text-xs font-bold text-blue-400">{formatBitrate(item.lastMetric?.outboundBitrate)}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 pb-2 text-[10px] text-gray-500 text-right">
        {formatTime(item.lastPolledAt)}
      </div>
    </div>
  );
}
