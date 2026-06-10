import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, RefreshCw, Calendar, Plus, History } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import api from '@/lib/api';

interface SnapshotHistory {
  id: string;
  period: string;
  groupName: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export default function ReceiptHistoryPage() {
  const [history, setHistory] = useState<SnapshotHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskTotal, setTaskTotal] = useState(1);
  const [taskMessage, setTaskMessage] = useState('');
  const [syncStart, setSyncStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [syncEnd, setSyncEnd] = useState(() => {
    return new Date().toISOString().slice(0, 16);
  });

  const fetchHistory = async () => {
    try {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.get('/api/receipt-reports', { params: {} as any });
      setHistory(res.data);
    } catch {
      toast.error('Gagal memuat history laporan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory();
  }, []);

  useEffect(() => {
    if (!activeTaskId) return;

    const eventSource = new EventSource('/api/monitoring/events');
    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'task_progress' && data.taskId === activeTaskId) {
          setTaskProgress(data.progress);
          setTaskTotal(data.total);
          if (data.message) setTaskMessage(data.message);

          if (data.status === 'completed') {
            toast.success(data.message || 'Sinkronisasi PRTG selesai.');
            setSyncOpen(false);
            setSyncing(false);
            setActiveTaskId(null);
            eventSource.close();
          } else if (data.status === 'failed') {
            toast.error(data.message || 'Gagal sinkronisasi data PRTG');
            setSyncing(false);
            setActiveTaskId(null);
            eventSource.close();
          }
        }
      } catch (err) {
        // ignore JSON parse errors
      }
    };

    // Note: The NestJS Sse() decorator uses the event name 'message' by default if we don't specify an Event property, 
    // but the MonitoringEventController emits { data: event }. 
    // In NestJS, returning { data } emits an event named 'message'.
    eventSource.addEventListener('message', handleEvent);
    
    // In case NestJS assigns the event name based on something else, listen to 'monitoring_event' too
    eventSource.addEventListener('monitoring_event', handleEvent);

    return () => {
      eventSource.close();
    };
  }, [activeTaskId]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      setTaskProgress(0);
      setTaskTotal(1);
      setTaskMessage('Menyiapkan task...');
      
      const res = await api.post('/api/receipt-reports/sync-history', {
        startDate: new Date(syncStart).toISOString(),
        endDate: new Date(syncEnd).toISOString(),
      });
      
      if (res.data?.taskId) {
        setActiveTaskId(res.data.taskId);
      } else {
        // Fallback for older API
        toast.success('Sinkronisasi PRTG selesai. Anda bisa Update laporan sekarang.');
        setSyncOpen(false);
        setSyncing(false);
      }
    } catch {
      toast.error('Gagal memulai sinkronisasi data PRTG');
      setSyncing(false);
    }
  };

  const handleManualGenerate = async () => {
    try {
      setGenerating(true);
      await api.post('/api/receipt-reports/manual-generate', {
        period: 'DAILY'
      });
      toast.success('Laporan berhasil digenerate');
      fetchHistory();
    } catch {
      toast.error('Gagal men-generate laporan');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Riwayat Laporan BW</h2>
          <p className="text-muted-foreground mt-1">
            Daftar laporan bandwidth yang telah dikirim ke WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
            <History className="h-4 w-4 mr-2" />
            Sync PRTG Data
          </Button>
          <Button size="sm" onClick={handleManualGenerate} disabled={generating}>
            <Plus className="h-4 w-4 mr-2" />
            {generating ? 'Memproses...' : 'Generate Harian'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History Snapshot</CardTitle>
          <CardDescription>Semua URL web-view laporan yang pernah dibuat.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Memuat data...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Belum ada riwayat laporan.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[600px]">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Periode</th>
                    <th className="px-4 py-3 font-medium">Grup</th>
                    <th className="px-4 py-3 font-medium">Waktu Data</th>
                    <th className="px-4 py-3 font-medium">Dibuat Pada</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((item) => (
                    <tr key={item.id} className="bg-card hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant="outline">{item.period}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">{item.groupName || 'Semua Grup'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(item.startDate).toLocaleDateString('id-ID')} - {new Date(item.endDate).toLocaleDateString('id-ID')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={async () => {
                              try {
                                toast.loading('Memperbarui data laporan...', { id: `update-${item.id}` });
                                await api.post(`/api/receipt-reports/${item.id}/update`);
                                toast.success('Laporan berhasil diperbarui!', { id: `update-${item.id}` });
                                fetchHistory();
                              } catch {
                                toast.error('Gagal memperbarui laporan', { id: `update-${item.id}` });
                              }
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                            Update
                          </Button>
                          <a 
                            href={`/report/${item.id}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Buka Web
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync PRTG Data</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Fitur ini akan menarik data historis langsung dari PRTG untuk rentang waktu yang dipilih, lalu menyimpan atau menimpa data history lokal. Gunakan jika ada insiden down yang tidak tercatat.
            </p>
            <div className="space-y-2">
              <Label>Waktu Mulai</Label>
              <Input
                type="datetime-local"
                value={syncStart}
                onChange={(e) => setSyncStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Waktu Selesai</Label>
              <Input
                type="datetime-local"
                value={syncEnd}
                onChange={(e) => setSyncEnd(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between w-full gap-4">
            {activeTaskId ? (
              <div className="w-full flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span>{taskMessage}</span>
                  <span>{Math.round((taskProgress / taskTotal) * 100)}%</span>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${(taskProgress / taskTotal) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSyncOpen(false)} disabled={syncing}>
                Batal
              </Button>
              <Button onClick={handleSync} disabled={syncing}>
                {syncing && !activeTaskId ? 'Memulai...' : syncing ? 'Sinkronisasi...' : 'Mulai Sync'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
