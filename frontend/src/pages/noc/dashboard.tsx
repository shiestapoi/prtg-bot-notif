import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/noc/StatusBadge';
import { useMonitoringSSE } from '@/hooks/use-sse';
import { monitoringApi, prtgGroupApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLinkIcon, BellIcon, ShieldOffIcon, ShieldCheckIcon } from 'lucide-react';
import type { MonitoringSummaryItem, MonitoringStatusEvent, NocStatus } from '@/lib/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBitrate(bitrate: number | null | undefined): string {
  if (bitrate == null) return '—';
  const mbit = bitrate / 1_000_000;
  return `${mbit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`;
}

function formatLastPolled(lastPolledAt: string | null): string {
  if (!lastPolledAt) return 'Never polled';
  const date = new Date(lastPolledAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString();
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

function sortByStatus(a: MonitoringSummaryItem, b: MonitoringSummaryItem): number {
  const pa = STATUS_PRIORITY[a.lastStatus] ?? 5;
  const pb = STATUS_PRIORITY[b.lastStatus] ?? 5;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title);
}

// ─── Main Dashboard Page ────────────────────────────────────────────────────

export default function NocDashboardPage() {
  const [items, setItems] = useState<MonitoringSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartModal, setChartModal] = useState<{ title: string; sensorId: number } | null>(null);
  const [notifModal, setNotifModal] = useState<MonitoringSummaryItem | null>(null);
  const [sendingNotif, setSendingNotif] = useState(false);
  const [emergencyModal, setEmergencyModal] = useState<'disable' | 'enable' | null>(null);
  const [emergencyLoading, setEmergencyLoading] = useState(false);

  const refetchSummary = useCallback(async () => {
    try {
      const data = await monitoringApi.summary();
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  // Apply SSE events for instant updates
  const applyEvent = useCallback((event: MonitoringStatusEvent) => {
    setItems((prev) =>
      prev.map((item) =>
        item.configId === event.configId
          ? { ...item, lastStatus: event.currentStatus, lastPolledAt: event.timestamp, lastMetric: event.metric }
          : item,
      ),
    );
  }, []);

  const { events, isConnected, error: sseError } = useMonitoringSSE(applyEvent, {
    onConfigUpdated: refetchSummary,
  });

  // Group items by groupName, sort problematic items first within each group
  const groupedItems = useMemo(() => {
    const sorted = [...items].sort(sortByStatus);
    const grouped: Record<string, MonitoringSummaryItem[]> = {};
    for (const item of sorted) {
      const group = item.groupName || 'Ungrouped';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(item);
    }
    // Sort groups: groups with problems first
    const entries = Object.entries(grouped);
    entries.sort(([, a], [, b]) => {
      const aHasIssue = a.some((i) => i.lastStatus !== 'NORMAL');
      const bHasIssue = b.some((i) => i.lastStatus !== 'NORMAL');
      if (aHasIssue && !bHasIssue) return -1;
      if (!aHasIssue && bHasIssue) return 1;
      return 0;
    });
    return Object.fromEntries(entries);
  }, [items]);

  // Fetch initial state + auto-refresh every 30 seconds
  useEffect(() => {
    let cancelled = false;
    async function fetchSummary() {
      try {
        if (!items.length) setLoading(true);
        const data = await monitoringApi.summary();
        if (!cancelled) { setItems(data); setError(null); }
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSummary();

    // Auto-refresh every 30 seconds as fallback for SSE
    const interval = setInterval(fetchSummary, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-4">
        <Header isConnected={isConnected} sseError={sseError} itemCount={0} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Header isConnected={isConnected} sseError={sseError} itemCount={0} />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header isConnected={isConnected} sseError={sseError} itemCount={items.length} />

      {/* Emergency Controls */}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          className="gap-1"
          onClick={() => setEmergencyModal('disable')}
        >
          <ShieldOffIcon className="h-4 w-4" />
          Disable All
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setEmergencyModal('enable')}
        >
          <ShieldCheckIcon className="h-4 w-4" />
          Enable All
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No monitoring-enabled configs found. Enable monitoring on a config by setting a{' '}
          <a href="/report/configs" className="text-primary underline">Sensor ID</a>.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([groupName, groupItems]) => (
            <div key={groupName} className="space-y-3">
              <h2 className="text-lg font-semibold border-b pb-2">{groupName}</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groupItems.map((item) => (
                  <MonitoringCard
                    key={item.configId}
                    item={item}
                    onChartClick={() => setChartModal({ title: item.title, sensorId: item.sensorId })}
                    onSendNotif={(i) => setNotifModal(i)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent events log */}
      {events.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Recent Events</h2>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-3">
            {events.slice(0, 10).map((event, idx) => {
              const e = event as unknown as MonitoringStatusEvent;
              return (
                <div key={`${e.configId}-${e.timestamp}-${idx}`} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span className="font-medium">{e.configTitle}</span>
                  <StatusBadge status={e.previousStatus} className="text-[10px]" />
                  <span className="text-muted-foreground">→</span>
                  <StatusBadge status={e.currentStatus} className="text-[10px]" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart Modal — Large and responsive */}
      <Dialog open={chartModal !== null} onOpenChange={() => setChartModal(null)}>
        <DialogContent className="max-w-[95vw] w-full md:max-w-5xl p-0 overflow-hidden">
          {chartModal && (
            <div className="space-y-0">
              <div className="px-6 pt-5 pb-3">
                <h3 className="text-lg font-semibold">{chartModal.title}</h3>
              </div>
              <div className="bg-white p-3 mx-3 mb-4 rounded-lg">
                <img
                  src={`/api/monitoring/chart/${chartModal.sensorId}`}
                  alt={`Chart for ${chartModal.title}`}
                  className="w-full h-auto rounded"
                  style={{ minHeight: '200px' }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Notification Confirmation Modal */}
      <Dialog open={notifModal !== null} onOpenChange={() => setNotifModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kirim Notifikasi Monitoring</DialogTitle>
          </DialogHeader>
          {notifModal && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Kirim notifikasi status monitoring saat ini ke semua recipient?
              </p>
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Config:</span>
                  <span className="font-medium">{notifModal.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Group:</span>
                  <span>{notifModal.groupName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <StatusBadge status={notifModal.lastStatus} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bitrate:</span>
                  <span>{formatBitrate(notifModal.lastMetric?.totalTrafficBitrate)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifModal(null)}>Batal</Button>
            <Button
              disabled={sendingNotif}
              onClick={async () => {
                if (!notifModal) return;
                setSendingNotif(true);
                try {
                  await monitoringApi.forceNotify(notifModal.configId);
                  toast.success(`Notifikasi berhasil dikirim untuk "${notifModal.title}"`);
                  setNotifModal(null);
                } catch (err) {
                  toast.error(`Gagal: ${err instanceof Error ? err.message : 'Unknown error'}`);
                } finally {
                  setSendingNotif(false);
                }
              }}
            >
              {sendingNotif ? 'Mengirim...' : 'Kirim Sekarang'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Emergency Disable/Enable Modal */}
      <Dialog open={emergencyModal !== null} onOpenChange={() => setEmergencyModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {emergencyModal === 'disable' ? '⚠️ Disable Semua Group' : '✅ Enable Semua Group'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {emergencyModal === 'disable'
              ? 'Ini akan MEMATIKAN semua monitoring dan schedule dispatch. Tidak ada notifikasi yang akan dikirim sampai di-enable kembali.'
              : 'Ini akan MENGAKTIFKAN kembali semua group. Monitoring dan schedule akan berjalan normal.'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmergencyModal(null)}>Batal</Button>
            <Button
              variant={emergencyModal === 'disable' ? 'destructive' : 'default'}
              disabled={emergencyLoading}
              onClick={async () => {
                setEmergencyLoading(true);
                try {
                  if (emergencyModal === 'disable') {
                    const result = await prtgGroupApi.emergencyDisableAll();
                    toast.success(`${result.disabled} group berhasil di-disable`);
                  } else {
                    const result = await prtgGroupApi.emergencyEnableAll();
                    toast.success(`${result.enabled} group berhasil di-enable`);
                  }
                  setEmergencyModal(null);
                } catch (err) {
                  toast.error(`Gagal: ${err instanceof Error ? err.message : 'Unknown error'}`);
                } finally {
                  setEmergencyLoading(false);
                }
              }}
            >
              {emergencyLoading ? 'Processing...' : emergencyModal === 'disable' ? 'Disable Semua' : 'Enable Semua'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Monitoring Card ────────────────────────────────────────────────────────

interface MonitoringCardProps {
  item: MonitoringSummaryItem;
  onChartClick: () => void;
  onSendNotif: (item: MonitoringSummaryItem) => void;
}

function MonitoringCard({ item, onChartClick, onSendNotif }: MonitoringCardProps) {
  const [imgError, setImgError] = useState(false);
  // Add timestamp to force chart refresh on each poll
  const chartUrl = `/api/monitoring/chart/${item.sensorId}?t=${item.lastPolledAt ?? ''}`;
  const prtgUrl = `http://prtg.r1net.id/sensor.htm?id=${item.sensorId}&tabid=1`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate text-sm" title={item.title}>
          {item.title}
        </CardTitle>
        <CardAction>
          <StatusBadge status={item.lastStatus} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* PRTG Chart Image — white background, clickable */}
        {!imgError ? (
          <button
            type="button"
            onClick={onChartClick}
            className="w-full cursor-pointer rounded-md border bg-white p-1 transition hover:shadow-md hover:ring-2 hover:ring-primary/30"
            title="Klik untuk memperbesar chart"
          >
            <img
              src={chartUrl}
              alt={`Chart for ${item.title}`}
              className="w-full rounded"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          </button>
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed bg-muted/50 text-xs text-muted-foreground">
            Chart tidak tersedia
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Total</div>
            <div className="font-medium">{formatBitrate(item.lastMetric?.totalTrafficBitrate)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">In</div>
            <div className="font-medium text-green-600 dark:text-green-400">{formatBitrate(item.lastMetric?.inboundBitrate)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Out</div>
            <div className="font-medium text-blue-600 dark:text-blue-400">{formatBitrate(item.lastMetric?.outboundBitrate)}</div>
          </div>
        </div>

        {/* Last polled */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Last polled</span>
          <span className="font-medium text-foreground">{formatLastPolled(item.lastPolledAt)}</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <a
            href={prtgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="outline" size="sm" className="w-full text-xs gap-1">
              <ExternalLinkIcon className="h-3 w-3" />
              PRTG
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs gap-1"
            onClick={() => onSendNotif(item)}
          >
            <BellIcon className="h-3 w-3" />
            Kirim Notif
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────

interface HeaderProps {
  isConnected: boolean;
  sseError: Error | null;
  itemCount: number;
}

function Header({ isConnected, sseError, itemCount }: HeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">NOC Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Real-time monitoring for {itemCount} config{itemCount !== 1 ? 's' : ''}.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`inline-flex h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          aria-label={isConnected ? 'Connected' : 'Disconnected'}
        />
        <span className="text-muted-foreground">
          {isConnected ? 'Live' : sseError?.message || 'Disconnected'}
        </span>
      </div>
    </div>
  );
}
