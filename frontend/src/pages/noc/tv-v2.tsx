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
  MAINTENANCE: -1,
  DOWN: 0,
  NO_TRAFFIC: 1,
  POSSIBLE_FLAPPING: 2,
  HIGH_UTILIZATION: 3,
  LOW_TRAFFIC: 4,
  NORMAL: 5,
};

const STATUS_COLORS: Record<NocStatus, string> = {
  DOWN: 'bg-[#ef4444] text-white animate-pulse',
  NO_TRAFFIC: 'bg-[#ef4444] text-white',
  POSSIBLE_FLAPPING: 'bg-[#f59e0b] text-black',
  HIGH_UTILIZATION: 'bg-[#f59e0b] text-black',
  LOW_TRAFFIC: 'bg-[#fadb14] text-[#0a0a0a] font-bold',
  NORMAL: 'bg-[#22c55e] text-black',
  MAINTENANCE: 'bg-[#fadb14] text-[#0a0a0a] font-bold',
};

const STATUS_CARD_BORDER: Record<NocStatus, string> = {
  DOWN: 'border-[#ef4444] ring-1 ring-[#ef4444]',
  NO_TRAFFIC: 'border-[#ef4444]',
  POSSIBLE_FLAPPING: 'border-[#f59e0b]',
  HIGH_UTILIZATION: 'border-[#f59e0b]',
  LOW_TRAFFIC: 'border-[#fadb14]',
  NORMAL: 'border-[#2a2a2a]',
  MAINTENANCE: 'border-[#fadb14]',
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

export default function NocTvDashboardPageV2() {
  const [items, setItems] = useState<MonitoringSummaryItem[]>([]);
  const [pingMonitors, setPingMonitors] = useState<PingMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => !!(window as any).__tvSoundEnabled);
  const [hasInteracted, setHasInteracted] = useState(() => !!(window as any).__tvInteracted);
  const [spotlightEnabled, setSpotlightEnabled] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [alarmModalOpen, setAlarmModalOpen] = useState(false);
  const { playAlarm, alarmType, setAlarmType } = useAlertSound();
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

    if (soundEnabled && event.host.includes('prtg.r1net.id') && !event.maintenance) {
      if (event.status === 'RTO' && previousStatus !== 'RTO') {
        playAlarm();
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
  }, [soundEnabled, playAlarm]);

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
    (window as any).__tvInteracted = true;
    (window as any).__tvSoundEnabled = true;
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
    () => pingMonitors.find((monitor) => monitor.host.includes('prtg.r1net.id')) ?? pingMonitors[0] ?? null,
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <Loader />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen font-sans text-white p-6 select-none transition-colors duration-700 bg-[#0a0a0a]`}
      onClick={() => { if (!hasInteracted) handleEnableSound(); }}
    >
      {/* Connection Lost Overlay */}
      {!isConnected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] p-12 rounded-[12px] border border-[#2a2a2a] text-center shadow-2xl">
            <div className="text-[56px] font-bold text-[#ef4444] mb-4 tracking-[-2px] animate-pulse">OFFLINE</div>
            <p className="text-[16px] text-[#cccccc]">Reconnecting... Auto-reload in 30 seconds</p>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <header className="sticky top-0 z-[60] flex items-center justify-between mb-8 pb-4 border-b border-[#2a2a2a] bg-[#0a0a0a]">
        <div className="flex items-center gap-6">
          <h1 className="text-[24px] font-bold tracking-[-0.3px] text-white">CLICKHOUSE NOC</h1>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${isConnected ? 'bg-[#22c55e]' : 'bg-[#ef4444] animate-pulse'}`} />
            <span className="text-[14px] font-medium text-[#cccccc] uppercase tracking-[1.5px]">{isConnected ? 'LIVE' : 'DISCONNECTED'}</span>
          </div>
          {publicIpMonitor && (
            <div className="flex items-center gap-2 ml-4">
              <span className={`inline-block h-3 w-3 rounded-full ${publicIpMonitor.maintenance ? 'bg-[#fadb14]' : publicIpMonitor.status === 'RTO' ? 'bg-[#ef4444] animate-pulse' : 'bg-[#22c55e]'}`} />
              <span className="text-[14px] font-medium text-[#cccccc] uppercase tracking-[1.5px]">{publicIpMonitor.maintenance ? (publicIpMonitor.maintenanceLabel ?? 'MAINT') : 'WEB PRTG'}</span>
              <span className={`font-mono text-[14px] font-normal ${publicIpMonitor.maintenance ? 'text-[#fadb14]' : publicIpMonitor.status === 'RTO' ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
                {publicIpMonitor.maintenance ? 'MAINT' : publicIpMonitor.lastLatencyMs === null ? publicIpMonitor.status : `${publicIpMonitor.lastLatencyMs.toFixed(1)}ms`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Status Summary */}
          <div className="flex items-center gap-3 mr-4">
            {downCount > 0 && (
              <span className="font-bold text-[18px] text-[#ef4444] animate-pulse tracking-[-0.5px]">
                {downCount} DOWN
              </span>
            )}
            {warningCount > 0 && (
              <span className="font-bold text-[18px] text-[#fadb14] tracking-[-0.5px]">
                {warningCount} WARN
              </span>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            className="rounded-[8px] bg-[#1a1a1a] hover:bg-[#242424] text-white px-[20px] py-[12px] text-[14px] font-semibold transition border border-[#2a2a2a]"
          >
            {isFullscreen ? 'Exit Full' : 'Fullscreen'}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              const modes: ViewMode[] = ['grid', 'compact', 'list'];
              const currentIdx = modes.indexOf(viewMode);
              setViewMode(modes[(currentIdx + 1) % modes.length]);
            }}
            className="rounded-[8px] bg-[#1a1a1a] hover:bg-[#242424] text-white px-[20px] py-[12px] text-[14px] font-semibold transition border border-[#2a2a2a] capitalize"
          >
            View: {viewMode}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setSpotlightEnabled(!spotlightEnabled); }}
            className={`rounded-[8px] px-[20px] py-[12px] text-[14px] font-semibold transition ${spotlightEnabled ? 'bg-[#fadb14] text-[#0a0a0a]' : 'bg-[#1a1a1a] text-white hover:bg-[#242424] border border-[#2a2a2a]'}`}
          >
            Spotlight {spotlightEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              const newVal = !soundEnabled;
              (window as any).__tvSoundEnabled = newVal;
              (window as any).__tvInteracted = true;
              setSoundEnabled(newVal); 
              setHasInteracted(true); 
            }}
            className={`rounded-[8px] px-[20px] py-[12px] text-[14px] font-semibold transition ${soundEnabled ? 'bg-[#22c55e] text-[#0a0a0a]' : 'bg-[#1a1a1a] text-white hover:bg-[#242424] border border-[#2a2a2a]'}`}
          >
            Sound {soundEnabled ? 'ON' : 'OFF'}
          </button>

          {/* Clock */}
          <div className="text-right ml-4">
            <div className="text-[24px] font-mono font-bold tracking-[-0.5px] leading-none text-white">
              {clockStr.time}
            </div>
            <div className="text-[12px] text-[#888888] font-medium tracking-[1.5px] uppercase mt-1">
              {clockStr.date}
            </div>
          </div>
        </div>
      </header>

      {/* Sound Enable Prompt */}
      {!hasInteracted && (
        <div className="mb-2 rounded bg-blue-900/50 border border-blue-500 p-2 text-center text-[10px] text-[#fadb14]">
          Klik di mana saja untuk mengaktifkan alert sound
        </div>
      )}

      {/* Group Filter Tabs */}
      {groups.length > 2 && (
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {groups.map((group) => (
            <button
              key={group}
              onClick={(e) => { e.stopPropagation(); setSelectedGroup(group); }}
              className={`shrink-0 rounded-[8px] px-[14px] py-[8px] text-[14px] font-semibold transition ${selectedGroup === group ? 'bg-[#1a1a1a] text-white border border-[#333333]' : 'bg-transparent text-[#888888] hover:text-white'}`}
            >
              {group}
            </button>
          ))}
        </div>
      )}

      {/* Cards — view mode dependent */}
      {viewMode === 'grid' && (
        <div className={`grid ${gridCols} gap-6`}>
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
            className="bg-[#141414] border border-[#333333] rounded-xl p-4 w-[320px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold mb-3">Pilih Alarm Sound</h3>
            <div className="flex flex-col gap-2">
              {(Object.keys(ALARM_FILES) as AlarmType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => { setAlarmType(type); setAlarmModalOpen(false); }}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-[11px] font-medium transition ${alarmType === type ? 'bg-[#fadb14] text-black font-bold text-white' : 'bg-[#1f1f1f] text-gray-300 hover:bg-gray-700'}`}
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
          <div className={`w-[70vw] max-w-4xl rounded-xl bg-[#141414] border ${hasDown ? 'border-red-500' : 'border-[#333333]'} p-4 shadow-2xl transition-all duration-500 ${spotlightVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
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
            <div className="mt-3 h-1 rounded-full bg-[#1f1f1f] overflow-hidden">
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
            className="bg-[#141414] border border-[#333333] rounded-xl p-5 w-[400px] max-w-[90vw] shadow-2xl"
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
            <div className="mb-4 p-2 rounded-lg bg-[#1f1f1f]">
              <div className="text-[9px] text-gray-500 uppercase mb-1">Status</div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${detailItem.maintenance ? 'bg-[#fadb14] text-black font-bold text-white' : STATUS_COLORS[detailItem.lastStatus]}`}>
                {detailItem.maintenance ? `🔧 ${detailItem.maintenanceLabel ?? 'Maintenance'}` : detailItem.lastStatus.replace('_', ' ')}
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mb-4 p-2 rounded-lg bg-[#1f1f1f]">
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
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${detailItem.maintenance && detailItem.maintenanceLabel === 'Maintenance' ? 'bg-[#fadb14] text-black font-bold text-white' : 'bg-[#1f1f1f] text-gray-300 hover:bg-gray-700 border border-gray-600'}`}
                >
                  🔧 Maintenance
                </button>
                <button
                  onClick={() => { setMaintenanceLabel(detailItem.configId, 'Mati Lampu'); setDetailItem({ ...detailItem, maintenance: true, maintenanceLabel: 'Mati Lampu' }); }}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${detailItem.maintenance && detailItem.maintenanceLabel === 'Mati Lampu' ? 'bg-yellow-600 text-white' : 'bg-[#1f1f1f] text-gray-300 hover:bg-gray-700 border border-gray-600'}`}
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
      className={`relative rounded-[12px] border ${isMaintenance ? 'border-[#fadb14] ring-1 ring-[#fadb14]/30' : STATUS_CARD_BORDER[item.lastStatus]} bg-[#1a1a1a] p-0 overflow-hidden transition-all ${isDown && !isMaintenance ? 'shadow-[0_0_15px_rgba(239,68,68,0.2)]' : ''} ${isMaintenance ? 'opacity-80' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(true); }}
      onClick={(e) => { e.stopPropagation(); if (!showMenu) onClickDetail(item); }}
    >
      {/* Context Menu (right-click) */}
      {showMenu && (
        <div className="absolute top-12 right-4 z-50 rounded-[8px] bg-[#242424] border border-[#3a3a3a] shadow-xl py-2 min-w-[200px]">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMaintenance(item.configId, item.maintenance); setShowMenu(false); }}
            className="w-full text-left px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#333333] transition"
          >
            {isMaintenance ? 'Akhiri Maintenance' : 'Set Maintenance'}
          </button>
        </div>
      )}
      
      {/* Title + Status */}
      <div className="flex items-start justify-between p-6 pb-4 border-b border-[#2a2a2a] bg-[#1a1a1a]">
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-[13px] font-medium text-[#888888] tracking-[1px] uppercase mb-1">{item.groupName}</p>
          <h3 className="text-[20px] font-bold text-white tracking-[-0.3px] leading-tight" title={item.title}>{item.title}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isMaintenance ? (
            <span className="shrink-0 rounded-full px-[12px] py-[4px] text-[12px] font-bold uppercase bg-[#fadb14] text-[#0a0a0a] tracking-[1.5px]">
              {item.maintenanceLabel ?? 'MAINTENANCE'}
            </span>
          ) : (
            <span className={`shrink-0 rounded-full px-[12px] py-[4px] text-[12px] font-bold uppercase tracking-[1.5px] ${STATUS_COLORS[item.lastStatus]}`}>
              {item.lastStatus.replace('_', ' ')}
            </span>
          )}
          {item.lastStatus !== 'NORMAL' && !isMaintenance && duration && (
            <span className="text-[14px] font-mono text-[#888888] mt-1">{duration}</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative w-full h-[120px] bg-[#0a0a0a] border-b border-[#2a2a2a]">
        {!imgError ? (
          <>
            {imgLoading && (
              <div className="absolute inset-0 bg-[#121212] animate-pulse" />
            )}
            <img
              src={cachedChartUrl}
              alt={item.title}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
              loading="lazy"
              onLoad={() => setImgLoading(false)}
              onError={() => { setImgError(true); setImgLoading(false); }}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#121212] text-[14px] font-mono text-[#5a5a5a]">NO CHART DATA</div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-0 bg-[#1a1a1a] p-4 divide-x divide-[#2a2a2a]">
        <div className="px-2 text-center">
          <div className="text-[12px] font-semibold text-[#888888] uppercase tracking-[1.5px] mb-1">Total</div>
          <div className="text-[16px] font-mono font-normal text-white">{formatBitrate(item.lastMetric?.totalTrafficBitrate)}</div>
        </div>
        <div className="px-2 text-center">
          <div className="text-[12px] font-semibold text-[#888888] uppercase tracking-[1.5px] mb-1">In</div>
          <div className="text-[16px] font-mono font-normal text-[#22c55e]">{formatBitrate(item.lastMetric?.inboundBitrate)}</div>
        </div>
        <div className="px-2 text-center">
          <div className="text-[12px] font-semibold text-[#888888] uppercase tracking-[1.5px] mb-1">Out</div>
          <div className="text-[16px] font-mono font-normal text-[#3b82f6]">{formatBitrate(item.lastMetric?.outboundBitrate)}</div>
        </div>
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
      className={`relative rounded-[12px] border ${isMaintenance ? 'border-[#fadb14] ring-1 ring-[#fadb14]/30' : STATUS_CARD_BORDER[item.lastStatus]} bg-[#1a1a1a] p-4 transition-all ${isDown && !isMaintenance ? 'shadow-[0_0_15px_rgba(239,68,68,0.2)]' : ''} ${isMaintenance ? 'opacity-80' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onToggleMaintenance(item.configId, item.maintenance); }}
      onClick={(e) => { e.stopPropagation(); onClickDetail(item); }}
    >
      {/* Title + Status */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 pr-2">
          <p className="text-[10px] font-medium text-[#888888] tracking-[1px] uppercase mb-1">{item.groupName}</p>
          <h3 className="text-[14px] font-bold text-white tracking-[-0.2px] leading-tight truncate" title={item.title}>{item.title}</h3>
        </div>
        {isMaintenance ? (
          <span className="shrink-0 rounded-full px-[8px] py-[2px] text-[10px] font-bold uppercase bg-[#fadb14] text-[#0a0a0a]">
            {item.maintenanceLabel ?? 'MAINT'}
          </span>
        ) : (
          <span className={`shrink-0 rounded-full px-[8px] py-[2px] text-[10px] font-bold uppercase ${STATUS_COLORS[item.lastStatus]}`}>
            {item.lastStatus.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Metrics — stacked */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[12px]">
          <span className="text-[#888888] font-semibold uppercase tracking-[1px] text-[10px]">Total</span>
          <span className="font-mono text-white">{formatBitrate(item.lastMetric?.totalTrafficBitrate)}</span>
        </div>
        <div className="flex justify-between items-center text-[12px]">
          <span className="text-[#888888] font-semibold uppercase tracking-[1px] text-[10px]">In</span>
          <span className="font-mono text-[#22c55e]">{formatBitrate(item.lastMetric?.inboundBitrate)}</span>
        </div>
        <div className="flex justify-between items-center text-[12px]">
          <span className="text-[#888888] font-semibold uppercase tracking-[1px] text-[10px]">Out</span>
          <span className="font-mono text-[#3b82f6]">{formatBitrate(item.lastMetric?.outboundBitrate)}</span>
        </div>
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
      className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px_100px] gap-4 items-center px-4 py-3 rounded-[8px] border ${isMaintenance ? 'border-[#fadb14]' : STATUS_CARD_BORDER[item.lastStatus]} bg-[#1a1a1a] ${isDown && !isMaintenance ? 'shadow-[0_0_10px_rgba(239,68,68,0.15)]' : ''} ${isMaintenance ? 'opacity-80' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onToggleMaintenance(item.configId, item.maintenance); }}
      onClick={(e) => { e.stopPropagation(); onClickDetail(item); }}
    >
      {/* Name */}
      <div className="min-w-0">
        <p className="text-[10px] text-[#888888] font-semibold tracking-[1px] uppercase mb-0.5">{item.groupName}</p>
        <h3 className="text-[14px] font-bold text-white tracking-[-0.2px] truncate">{item.title}</h3>
      </div>

      {/* Status */}
      <div className="text-center">
        {isMaintenance ? (
          <span className="inline-block rounded-full px-[10px] py-[3px] text-[10px] font-bold uppercase bg-[#fadb14] text-[#0a0a0a]">
            {item.maintenanceLabel ?? 'MAINT'}
          </span>
        ) : (
          <span className={`inline-block rounded-full px-[10px] py-[3px] text-[10px] font-bold uppercase ${STATUS_COLORS[item.lastStatus]}`}>
            {item.lastStatus.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Total */}
      <div className="text-right text-[14px] font-mono font-medium text-white">
        {formatBitrate(item.lastMetric?.totalTrafficBitrate)}
      </div>

      {/* In */}
      <div className="text-right text-[14px] font-mono font-medium text-[#22c55e]">
        {formatBitrate(item.lastMetric?.inboundBitrate)}
      </div>

      {/* Out */}
      <div className="text-right text-[14px] font-mono font-medium text-[#3b82f6]">
        {formatBitrate(item.lastMetric?.outboundBitrate)}
      </div>

      {/* Down count */}
      <div className="text-center">
        {item.downCountToday > 0 && (
          <span className="text-[12px] font-mono font-medium text-[#ef4444]">🔴 {item.downCountToday}x</span>
        )}
      </div>

      {/* Time */}
      <div className="text-right text-[12px] font-mono text-[#888888]">
        {formatTime(item.lastPolledAt)}
      </div>
    </div>
  );
});
