import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useMonitoringSSE } from '@/hooks/use-sse';
import { monitoringApi, pingMonitorApi } from '@/lib/api';
import type { MonitoringSummaryItem, MonitoringStatusEvent, NocStatus, PingMonitor, PingStatusEvent } from '@/lib/types';
import Loader from '@/components/ui/loader';

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

type AlarmType = 'beep' | 'sshh' | 'alarm3' | 'fahhh' | 'alarm2';

const ALARM_FILES: Record<AlarmType, string> = {
  beep: '/sounds/beep.wav',
  sshh: '/sounds/sshh.wav',
  alarm3: '/sounds/alarm3.wav',
  fahhh: '/sounds/fahhh.wav',
  alarm2: '/sounds/alarm2.wav',
};

const ALARM_LABELS: Record<AlarmType, string> = {
  beep: '🔔 Beep',
  sshh: '🤫 Sshh',
  alarm3: '🚨 Alarm 3',
  fahhh: '😱 Fahhh',
  alarm2: '⚠️ Alarm 2',
};

function useAlertSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recoveryAudioRef = useRef<HTMLAudioElement | null>(null);
  // Read initial alarm type from cookie, default to 'beep'
  const [alarmType, setAlarmTypeState] = useState<AlarmType>(() => {
    const match = document.cookie.match(/(?:^|; )alarmType=([^;]*)/);
    const saved = match ? decodeURIComponent(match[1]) : null;
    return (saved && saved in ALARM_FILES) ? saved as AlarmType : 'alarm3';
  });
  const preloadedRef = useRef<Map<AlarmType, HTMLAudioElement>>(new Map());

  // Save alarm type to cookie when changed (expires in 1 year)
  const setAlarmType = useCallback((type: AlarmType) => {
    setAlarmTypeState(type);
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `alarmType=${encodeURIComponent(type)}; expires=${expires}; path=/`;
  }, []);

  // Preload all alarm sound files on mount
  useEffect(() => {
    const entries = Object.entries(ALARM_FILES) as [AlarmType, string][];
    entries.forEach(([type, src]) => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.load();
      preloadedRef.current.set(type, audio);
    });
  }, []);

  /** Play the selected alarm sound file */
  const playAlarm = useCallback(() => {
    // Stop any currently playing sound
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Use preloaded audio if available, otherwise create new
    const preloaded = preloadedRef.current.get(alarmType);
    const audio = preloaded ? preloaded.cloneNode(true) as HTMLAudioElement : new Audio(ALARM_FILES[alarmType]);
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

  const playRecovery = useCallback(() => {
    if (recoveryAudioRef.current) {
      recoveryAudioRef.current.pause();
      recoveryAudioRef.current.currentTime = 0;
    }
    const audio = new Audio('/sounds/beep.wav');
    audio.volume = 0.65;
    recoveryAudioRef.current = audio;
    audio.play().catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (recoveryAudioRef.current) {
        recoveryAudioRef.current.pause();
        recoveryAudioRef.current = null;
      }
    };
  }, []);

  return { playAlarm, playRecovery, stopAlarm, alarmType, setAlarmType };
}

// ─── TV Dashboard Page ──────────────────────────────────────────────────────

type ViewMode = 'grid' | 'compact' | 'list';

export default function NocTvDashboardPage() {
  const [items, setItems] = useState<MonitoringSummaryItem[]>([]);
  const [pingMonitors, setPingMonitors] = useState<PingMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [spotlightEnabled, setSpotlightEnabled] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [alarmModalOpen, setAlarmModalOpen] = useState(false);
  const { playAlarm, playRecovery, alarmType, setAlarmType } = useAlertSound();
  useWakeLock();
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  // ─── Auto-reload on prolonged disconnect ────────────────────────────────
  const disconnectedSinceRef = useRef<number | null>(null);
  const pingStatusRef = useRef<Map<number, PingMonitor['status']>>(new Map());

  // SSE for real-time updates
  const onStatusChange = useCallback((event: MonitoringStatusEvent) => {
    setItems((prev) =>
      prev.map((item) =>
        item.configId === event.configId
          ? { ...item, lastStatus: event.currentStatus, lastPolledAt: event.timestamp, lastMetric: event.metric, maintenance: event.maintenance ?? item.maintenance }
          : item,
      ),
    );

    // Play alert sound on new DOWN event (skip if maintenance)
    if (event.currentStatus === 'DOWN' && event.previousStatus !== 'DOWN' && soundEnabled && !event.maintenance) {
      playAlarm();
    }
  }, [soundEnabled, playAlarm]);

  // Re-fetch summary when config is created/updated/deleted
  const refetchSummary = useCallback(async () => {
    try {
      const data = await monitoringApi.summary();
      setItems(data);
    } catch { /* silent */ }
  }, []);

  const onPingStatus = useCallback((event: PingStatusEvent) => {
    const previousStatus = pingStatusRef.current.get(event.monitorId);
    pingStatusRef.current.set(event.monitorId, event.status);

    if (soundEnabled && event.host === '223.130.21.34' && !event.maintenance) {
      if (event.status === 'RTO' && previousStatus !== 'RTO') {
        playAlarm();
      } else if (event.status === 'UP' && previousStatus === 'RTO') {
        playRecovery();
      }
    }

    setPingMonitors((prev) => prev.map((monitor) =>
      monitor.id === event.monitorId
        ? {
            ...monitor,
            name: event.name,
            host: event.host,
            status: event.status,
            lastLatencyMs: event.latencyMs,
            lastCheckedAt: event.checkedAt,
            outageStartedAt: event.outageStartedAt,
            maintenance: event.maintenance,
            maintenanceLabel: event.maintenanceLabel,
          }
        : monitor,
    ));
  }, [soundEnabled, playAlarm, playRecovery]);

  const { isConnected } = useMonitoringSSE(onStatusChange, { onConfigUpdated: refetchSummary, onPingStatus });

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

  // Clock update every second — only update clock display, not card props
  const [clockStr, setClockStr] = useState(() => {
    const now = new Date();
    return {
      time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }),
      date: now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }),
    };
  });
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setClockStr({
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }),
        date: now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial data only (real-time updates via SSE)
  useEffect(() => {
    let cancelled = false;
    async function fetchSummary() {
      try {
        const [data, pingData] = await Promise.all([monitoringApi.summary(), pingMonitorApi.getAll()]);
        if (!cancelled) {
          setItems(data);
          setPingMonitors(pingData);
          pingStatusRef.current = new Map(
            pingData.map((monitor) => [monitor.id, monitor.status]),
          );
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchSummary();
    return () => { cancelled = true; };
  }, []);

  // Toggle maintenance mode for a config
  const toggleMaintenance = useCallback(async (configId: number, currentMaintenance: boolean, label?: string | null) => {
    try {
      await monitoringApi.toggleMaintenance(configId, !currentMaintenance, label);
      setItems((prev) =>
        prev.map((item) =>
          item.configId === configId
            ? { ...item, maintenance: !currentMaintenance, maintenanceLabel: !currentMaintenance ? (label ?? 'Maintenance') : null }
            : item,
        ),
      );
    } catch {
      // silent
    }
  }, []);

  // Set maintenance with specific label
  const setMaintenanceLabel = useCallback(async (configId: number, label: string | null) => {
    try {
      const maintenance = label !== null;
      await monitoringApi.toggleMaintenance(configId, maintenance, label);
      setItems((prev) =>
        prev.map((item) =>
          item.configId === configId
            ? { ...item, maintenance, maintenanceLabel: label }
            : item,
        ),
      );
    } catch {
      // silent
    }
  }, []);

  // Detail modal state
  const [detailItem, setDetailItem] = useState<MonitoringSummaryItem | null>(null);

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

  const downCount = useMemo(() => items.filter((i) => (i.lastStatus === 'DOWN' || i.lastStatus === 'NO_TRAFFIC') && !i.maintenance).length, [items]);
  const normalCount = useMemo(() => items.filter((i) => i.lastStatus === 'NORMAL' || i.maintenance).length, [items]);
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

  const hasDown = useMemo(() => items.some((i) => (i.lastStatus === 'DOWN' || i.lastStatus === 'NO_TRAFFIC') && !i.maintenance), [items]);
  const publicIpMonitor = useMemo(
    () => pingMonitors.find((monitor) => monitor.host === '223.130.21.34') ?? pingMonitors[0] ?? null,
    [pingMonitors],
  );

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
        <Loader />
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
          {publicIpMonitor && (
            <div className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${publicIpMonitor.maintenance ? 'bg-yellow-400' : publicIpMonitor.status === 'RTO' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[10px] text-gray-400">{publicIpMonitor.maintenance ? (publicIpMonitor.maintenanceLabel ?? 'MAINTENANCE') : 'IP PUBLIC SOLNET'}</span>
              <span className={`font-mono text-[10px] font-bold tabular-nums ${publicIpMonitor.maintenance ? 'text-yellow-300' : publicIpMonitor.status === 'RTO' ? 'text-red-400' : 'text-emerald-400'}`}>
                {publicIpMonitor.maintenance ? 'MAINT' : publicIpMonitor.lastLatencyMs === null ? publicIpMonitor.status : `${publicIpMonitor.lastLatencyMs.toFixed(1)} ms`}
              </span>
            </div>
          )}
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

          {/* View Mode Toggle — cycle button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const modes: ViewMode[] = ['grid', 'compact', 'list'];
              const currentIdx = modes.indexOf(viewMode);
              setViewMode(modes[(currentIdx + 1) % modes.length]);
            }}
            className="rounded bg-gray-700 hover:bg-gray-600 px-2 py-1 text-[10px] font-medium transition"
          >
            {viewMode === 'grid' ? '▦ Grid' : viewMode === 'compact' ? '▤ Compact' : '☰ List'}
          </button>

          {/* Spotlight Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setSpotlightEnabled(!spotlightEnabled); }}
            className={`rounded px-2 py-1 text-[10px] font-medium transition ${spotlightEnabled ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            {spotlightEnabled ? '📺 Rotate ON' : '📺 Rotate OFF'}
          </button>

          {/* Alarm Type Selector — opens modal */}
          <button
            onClick={(e) => { e.stopPropagation(); setAlarmModalOpen(true); }}
            className="rounded bg-gray-700 hover:bg-gray-600 px-2 py-1 text-[10px] font-medium transition"
          >
            {ALARM_LABELS[alarmType]}
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
              {clockStr.time}
            </div>
            <div className="text-[9px] text-gray-400">
              {clockStr.date}
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

      {/* Cards — view mode dependent */}
      {viewMode === 'grid' && (
        <div className={`grid ${gridCols} gap-2`}>
          {filteredItems.map((item) => (
            <TvCard key={item.configId} item={item} onToggleMaintenance={toggleMaintenance} onClickDetail={setDetailItem} />
          ))}
        </div>
      )}

      {viewMode === 'compact' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
          {filteredItems.map((item) => (
            <CompactCard key={item.configId} item={item} onToggleMaintenance={toggleMaintenance} onClickDetail={setDetailItem} />
          ))}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="flex flex-col gap-1">
          {/* List Header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px_80px] gap-2 px-2 py-1 text-[9px] text-gray-500 uppercase border-b border-gray-800">
            <span>Name</span>
            <span className="text-center">Status</span>
            <span className="text-right">Total</span>
            <span className="text-right">In</span>
            <span className="text-right">Out</span>
            <span className="text-center">Down</span>
            <span className="text-right">Updated</span>
          </div>
          {filteredItems.map((item) => (
            <ListRow key={item.configId} item={item} onToggleMaintenance={toggleMaintenance} onClickDetail={setDetailItem} />
          ))}
        </div>
      )}

      {/* Alarm Selector Modal */}
      {alarmModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); setAlarmModalOpen(false); }}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-4 w-[320px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold mb-3">Pilih Alarm Sound</h3>
            <div className="flex flex-col gap-2">
              {(Object.keys(ALARM_FILES) as AlarmType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => { setAlarmType(type); setAlarmModalOpen(false); }}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-[11px] font-medium transition ${alarmType === type ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                >
                  <span>{ALARM_LABELS[type]}</span>
                  {alarmType === type && <span className="text-[10px]">✓</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => { playAlarm(); }}
              className="mt-3 w-full rounded-lg bg-red-700 hover:bg-red-600 px-3 py-2 text-[11px] font-medium transition"
            >
              🔊 Test Sound
            </button>
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

      {/* Detail Modal — click on card to open */}
      {detailItem && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); setDetailItem(null); }}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-[400px] max-w-[90vw] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold">{detailItem.title}</h2>
                <p className="text-[10px] text-gray-400">{detailItem.groupName}</p>
              </div>
              <button
                onClick={() => setDetailItem(null)}
                className="rounded bg-gray-700 hover:bg-gray-600 px-2 py-1 text-[10px] font-medium"
              >
                ✕ Close
              </button>
            </div>

            {/* Current Status */}
            <div className="mb-4 p-2 rounded-lg bg-gray-800">
              <div className="text-[9px] text-gray-500 uppercase mb-1">Status</div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${detailItem.maintenance ? 'bg-blue-600 text-white' : STATUS_COLORS[detailItem.lastStatus]}`}>
                {detailItem.maintenance ? `🔧 ${detailItem.maintenanceLabel ?? 'Maintenance'}` : detailItem.lastStatus.replace('_', ' ')}
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mb-4 p-2 rounded-lg bg-gray-800">
              <div className="text-center">
                <div className="text-[8px] text-gray-500 uppercase">Total</div>
                <div className="text-[11px] font-bold">{formatBitrate(detailItem.lastMetric?.totalTrafficBitrate)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-gray-500 uppercase">In</div>
                <div className="text-[11px] font-bold text-green-400">{formatBitrate(detailItem.lastMetric?.inboundBitrate)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-gray-500 uppercase">Out</div>
                <div className="text-[11px] font-bold text-blue-400">{formatBitrate(detailItem.lastMetric?.outboundBitrate)}</div>
              </div>
            </div>

            {/* Maintenance Label Actions */}
            <div className="space-y-2">
              <div className="text-[9px] text-gray-500 uppercase">Label / Status Khusus</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setMaintenanceLabel(detailItem.configId, 'Maintenance'); setDetailItem({ ...detailItem, maintenance: true, maintenanceLabel: 'Maintenance' }); }}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${detailItem.maintenance && detailItem.maintenanceLabel === 'Maintenance' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'}`}
                >
                  🔧 Maintenance
                </button>
                <button
                  onClick={() => { setMaintenanceLabel(detailItem.configId, 'Mati Lampu'); setDetailItem({ ...detailItem, maintenance: true, maintenanceLabel: 'Mati Lampu' }); }}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${detailItem.maintenance && detailItem.maintenanceLabel === 'Mati Lampu' ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'}`}
                >
                  ⚡ Mati Lampu
                </button>
                {detailItem.maintenance && (
                  <button
                    onClick={() => { setMaintenanceLabel(detailItem.configId, null); setDetailItem({ ...detailItem, maintenance: false, maintenanceLabel: null }); }}
                    className="rounded-lg px-3 py-1.5 text-[10px] font-medium transition bg-red-800 text-red-200 hover:bg-red-700 border border-red-600"
                  >
                    ❌ Hapus Label
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes shrink { from { width: 100%; } to { width: 0%; } }
      `}</style>
    </div>
  );
}

// ─── TV Card ────────────────────────────────────────────────────────────────

const TvCard = memo(function TvCard({ item, onToggleMaintenance, onClickDetail }: { item: MonitoringSummaryItem; onToggleMaintenance: (configId: number, current: boolean, label?: string | null) => void; onClickDetail: (item: MonitoringSummaryItem) => void }) {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const prevPolledAtRef = useRef(item.lastPolledAt);
  const [cachedChartUrl, setCachedChartUrl] = useState(`/api/monitoring/chart/${item.sensorId}?t=${item.lastPolledAt ?? ''}`);
  const [duration, setDuration] = useState(() => formatDuration(item.lastPolledAt));

  // Only update chart URL when lastPolledAt actually changes (image caching)
  useEffect(() => {
    if (item.lastPolledAt !== prevPolledAtRef.current) {
      prevPolledAtRef.current = item.lastPolledAt;
      setImgLoading(true);
      setCachedChartUrl(`/api/monitoring/chart/${item.sensorId}?t=${item.lastPolledAt ?? ''}`);
      setImgError(false);
      setDuration(formatDuration(item.lastPolledAt));
    }
  }, [item.lastPolledAt, item.sensorId]);

  // Update duration every 60 seconds (not every second to avoid blink)
  useEffect(() => {
    if (item.lastStatus === 'NORMAL') return;
    const timer = setInterval(() => {
      setDuration(formatDuration(item.lastPolledAt));
    }, 60000);
    return () => clearInterval(timer);
  }, [item.lastPolledAt, item.lastStatus]);

  const isDown = item.lastStatus === 'DOWN' || item.lastStatus === 'NO_TRAFFIC';
  const isMaintenance = item.maintenance;
  const [showMenu, setShowMenu] = useState(false);

  // Close context menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showMenu]);

  return (
    <div
      className={`relative rounded-lg border ${isMaintenance ? 'border-blue-500 ring-1 ring-blue-500/30' : STATUS_CARD_BORDER[item.lastStatus]} bg-gray-900 overflow-hidden transition-all ${isDown && !isMaintenance ? 'shadow-md shadow-red-500/20' : ''} ${isMaintenance ? 'opacity-75' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(true); }}
      onClick={(e) => { e.stopPropagation(); if (!showMenu) onClickDetail(item); }}
    >
      {/* Context Menu (right-click) */}
      {showMenu && (
        <div className="absolute top-8 right-2 z-50 rounded-lg bg-gray-800 border border-gray-600 shadow-xl py-1 min-w-[160px]">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMaintenance(item.configId, item.maintenance); setShowMenu(false); }}
            className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-700 transition"
          >
            {isMaintenance ? '✅ Akhiri Maintenance' : '🔧 Set Maintenance'}
          </button>
        </div>
      )}
      {/* Title + Status */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-800">
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-semibold truncate" title={item.title}>{item.title}</h3>
          <p className="text-[9px] text-gray-500">{item.groupName}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {isMaintenance ? (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase bg-blue-600 text-white">
              🔧 {item.maintenanceLabel ?? 'MAINTENANCE'}
            </span>
          ) : (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${STATUS_COLORS[item.lastStatus]}`}>
              {item.lastStatus.replace('_', ' ')}
            </span>
          )}
          {item.lastStatus !== 'NORMAL' && !isMaintenance && duration && (
            <span className="text-[8px] text-gray-400">{duration}</span>
          )}
        </div>
      </div>

      {/* Chart with skeleton loading — aspect ratio 925:300 */}
      <div className="relative mx-1 mt-1 rounded overflow-hidden" style={{ aspectRatio: '925 / 300' }}>
        {!imgError ? (
          <>
            {imgLoading && (
              <div className="absolute inset-0 bg-gray-200 animate-pulse rounded">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-[40%] w-[80%] bg-gray-300 rounded" />
                    <div className="flex w-[80%] justify-between">
                      <div className="h-1.5 w-8 bg-gray-300 rounded" />
                      <div className="h-1.5 w-8 bg-gray-300 rounded" />
                      <div className="h-1.5 w-8 bg-gray-300 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <img
              src={cachedChartUrl}
              alt={item.title}
              className={`w-full h-full object-cover rounded transition-opacity duration-300 ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
              loading="lazy"
              onLoad={() => setImgLoading(false)}
              onError={() => { setImgError(true); setImgLoading(false); }}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200 rounded text-[8px] text-gray-400">No chart</div>
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
      <div className="flex items-center justify-between px-2 pb-1">
        {item.downCountThisMonth > 0 && (
          <span className="text-[8px] text-red-400 font-medium">🔴 {item.downCountThisMonth}x down bulan ini</span>
        )}
        <span className="text-[8px] text-gray-500 ml-auto">
          {formatTime(item.lastPolledAt)}
        </span>
      </div>
    </div>
  );
});

// ─── Compact Card (no chart, dense metrics) ─────────────────────────────────

const CompactCard = memo(function CompactCard({ item, onToggleMaintenance, onClickDetail }: { item: MonitoringSummaryItem; onToggleMaintenance: (configId: number, current: boolean, label?: string | null) => void; onClickDetail: (item: MonitoringSummaryItem) => void }) {
  const isDown = item.lastStatus === 'DOWN' || item.lastStatus === 'NO_TRAFFIC';
  const isMaintenance = item.maintenance;

  return (
    <div
      className={`rounded-lg border ${isMaintenance ? 'border-blue-500 ring-1 ring-blue-500/30' : STATUS_CARD_BORDER[item.lastStatus]} bg-gray-900 p-2 transition-all ${isDown && !isMaintenance ? 'shadow-md shadow-red-500/20' : ''} ${isMaintenance ? 'opacity-75' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onToggleMaintenance(item.configId, item.maintenance); }}
      onClick={(e) => { e.stopPropagation(); onClickDetail(item); }}
    >
      {/* Title + Status */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[10px] font-semibold truncate flex-1 mr-1" title={item.title}>{item.title}</h3>
        {isMaintenance ? (
          <span className="shrink-0 rounded px-1 py-0.5 text-[7px] font-bold uppercase bg-blue-600 text-white">
            🔧 {item.maintenanceLabel ?? 'MAINT'}
          </span>
        ) : (
          <span className={`shrink-0 rounded px-1 py-0.5 text-[7px] font-bold uppercase ${STATUS_COLORS[item.lastStatus]}`}>
            {item.lastStatus.replace('_', ' ')}
          </span>
        )}
      </div>
      <p className="text-[8px] text-gray-500 mb-1.5">{item.groupName}</p>

      {/* Metrics — stacked */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-[9px]">
          <span className="text-gray-500">Total</span>
          <span className="font-bold">{formatBitrate(item.lastMetric?.totalTrafficBitrate)}</span>
        </div>
        <div className="flex justify-between text-[9px]">
          <span className="text-gray-500">In</span>
          <span className="font-bold text-green-400">{formatBitrate(item.lastMetric?.inboundBitrate)}</span>
        </div>
        <div className="flex justify-between text-[9px]">
          <span className="text-gray-500">Out</span>
          <span className="font-bold text-blue-400">{formatBitrate(item.lastMetric?.outboundBitrate)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-gray-800">
        {item.downCountThisMonth > 0 ? (
          <span className="text-[7px] text-red-400 font-medium">🔴 {item.downCountThisMonth}x</span>
        ) : <span />}
        <span className="text-[7px] text-gray-500">{formatTime(item.lastPolledAt)}</span>
      </div>
    </div>
  );
});

// ─── List Row (table-like) ──────────────────────────────────────────────────

const ListRow = memo(function ListRow({ item, onToggleMaintenance, onClickDetail }: { item: MonitoringSummaryItem; onToggleMaintenance: (configId: number, current: boolean, label?: string | null) => void; onClickDetail: (item: MonitoringSummaryItem) => void }) {
  const isDown = item.lastStatus === 'DOWN' || item.lastStatus === 'NO_TRAFFIC';
  const isMaintenance = item.maintenance;

  return (
    <div
      className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px_80px] gap-2 items-center px-2 py-1.5 rounded border ${isMaintenance ? 'border-blue-500' : STATUS_CARD_BORDER[item.lastStatus]} bg-gray-900 ${isDown && !isMaintenance ? 'shadow-sm shadow-red-500/20' : ''} ${isMaintenance ? 'opacity-75' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onToggleMaintenance(item.configId, item.maintenance); }}
      onClick={(e) => { e.stopPropagation(); onClickDetail(item); }}
    >
      {/* Name */}
      <div className="min-w-0">
        <h3 className="text-[10px] font-semibold truncate">{item.title}</h3>
        <p className="text-[8px] text-gray-500">{item.groupName}</p>
      </div>

      {/* Status */}
      <div className="text-center">
        {isMaintenance ? (
          <span className="inline-block rounded px-1.5 py-0.5 text-[8px] font-bold uppercase bg-blue-600 text-white">
            🔧 {item.maintenanceLabel ?? 'MAINT'}
          </span>
        ) : (
          <span className={`inline-block rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${STATUS_COLORS[item.lastStatus]}`}>
            {item.lastStatus.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Total */}
      <div className="text-right text-[10px] font-bold">
        {formatBitrate(item.lastMetric?.totalTrafficBitrate)}
      </div>

      {/* In */}
      <div className="text-right text-[10px] font-bold text-green-400">
        {formatBitrate(item.lastMetric?.inboundBitrate)}
      </div>

      {/* Out */}
      <div className="text-right text-[10px] font-bold text-blue-400">
        {formatBitrate(item.lastMetric?.outboundBitrate)}
      </div>

      {/* Down count */}
      <div className="text-center">
        {item.downCountThisMonth > 0 && (
          <span className="text-[8px] text-red-400 font-medium">🔴 {item.downCountThisMonth}x</span>
        )}
      </div>

      {/* Time */}
      <div className="text-right text-[8px] text-gray-500">
        {formatTime(item.lastPolledAt)}
      </div>
    </div>
  );
});
