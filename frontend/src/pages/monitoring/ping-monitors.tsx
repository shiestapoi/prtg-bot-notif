import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Activity, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { pingMonitorApi, pingRecipientApi, type PingRecipient } from '@/lib/api';
import type { PingMonitor } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Terminal } from 'lucide-react';
import api from '@/lib/api';
import { useMonitoringSSE } from '@/hooks/use-sse';
import type { PingLogEvent } from '@/lib/types';
import { useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const defaultAlert = '*ALERT WEB PRTG*\nWeb PRTG R1NET ({host}) tidak bisa diakses dalam {outageSeconds} detik yang lalu.\nWaktu: {time}';
const defaultRecovery = '*PULIH*\nWeb PRTG R1NET ({host}) kembali bisa diakses.\nResponse: {latencyMs} ms\nWaktu: {time}';

type FormState = Pick<PingMonitor,
  'name' | 'host' | 'enabled' | 'intervalSeconds' | 'pingTimeoutSeconds' |
  'rtoThresholdSeconds' | 'notificationCooldownSeconds' | 'maintenance' | 'maintenanceLabel' |
  'notifyRecovery' | 'alertTemplate' | 'recoveryTemplate' |
  'recipientIds'
>;

const emptyForm: FormState = {
  name: 'Web PRTG R1NET',
  host: 'http://prtg.r1net.id',
  enabled: true,
  intervalSeconds: 2,
  pingTimeoutSeconds: 5,
  rtoThresholdSeconds: 10,
  notificationCooldownSeconds: 3600,
  maintenance: false,
  maintenanceLabel: 'Maintenance',
  notifyRecovery: true,
  alertTemplate: defaultAlert,
  recoveryTemplate: defaultRecovery,
  recipientIds: [],
};

export default function PingMonitorsPage() {
  const [monitors, setMonitors] = useState<PingMonitor[]>([]);
  const [recipients, setRecipients] = useState<PingRecipient[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<PingLogEvent[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsOpen) {
      api.get('/api/monitoring/ping-monitors/logs').then((res) => {
        setLogs(res.data.logs || []);
      }).catch(() => toast.error('Gagal memuat log ping'));
    }
  }, [logsOpen]);

  useMonitoringSSE(undefined, {
    onPingLog: (event) => {
      if (logsOpen) {
        setLogs((prev) => {
          const newLogs = [...prev, event];
          if (newLogs.length > 500) return newLogs.slice(-500);
          return newLogs;
        });
      }
    }
  });

  useEffect(() => {
    if (logsOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, logsOpen]);

  const selectMonitor = (monitor: PingMonitor) => {
    setSelectedId(monitor.id);
    setForm({
      name: monitor.name,
      host: monitor.host,
      enabled: monitor.enabled,
      intervalSeconds: monitor.intervalSeconds,
      pingTimeoutSeconds: monitor.pingTimeoutSeconds,
      rtoThresholdSeconds: monitor.rtoThresholdSeconds,
      notificationCooldownSeconds: monitor.notificationCooldownSeconds,
      maintenance: monitor.maintenance,
      maintenanceLabel: monitor.maintenanceLabel ?? 'Maintenance',
      notifyRecovery: monitor.notifyRecovery,
      alertTemplate: monitor.alertTemplate,
      recoveryTemplate: monitor.recoveryTemplate,
      recipientIds: monitor.recipientIds,
    });
  };

  const load = async () => {
    const [monitorData, recipientData] = await Promise.all([
      pingMonitorApi.getAll(),
      pingRecipientApi.getAll(),
    ]);
    setMonitors(monitorData);
    setRecipients(recipientData);
    if (selectedId === null && monitorData[0]) selectMonitor(monitorData[0]);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps



  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (selectedId === null) {
        const created = await pingMonitorApi.create(form);
        setSelectedId(created.id);
      } else {
        await pingMonitorApi.update(selectedId, form);
      }
      await load();
      toast.success('Konfigurasi ping monitor tersimpan');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const selected = monitors.find((monitor) => monitor.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Ping Monitoring</h2>
          <p className="text-muted-foreground mt-1">Kelola target ping dan konfigurasi notifikasi.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLogsOpen(true)}>
            <Terminal className="h-4 w-4 mr-2" />
            Live Logs
          </Button>
          <Button onClick={() => { setSelectedId(null); setForm(emptyForm); }}>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Monitor
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {monitors.map((monitor) => (
          <button key={monitor.id} onClick={() => selectMonitor(monitor)} className={`rounded-lg border p-4 text-left ${selectedId === monitor.id ? 'border-primary ring-1 ring-primary' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{monitor.name}</span>
              <Badge variant={monitor.maintenance ? 'secondary' : monitor.status === 'RTO' ? 'destructive' : monitor.status === 'UP' ? 'default' : 'secondary'}>{monitor.maintenance ? 'MAINT' : monitor.status}</Badge>
            </div>
            <div className="mt-2 font-mono text-sm">{monitor.host}</div>
            <div className="mt-1 text-xs text-muted-foreground">{monitor.lastLatencyMs === null ? 'RTO / belum ada data' : `${monitor.lastLatencyMs.toFixed(1)} ms`}</div>
          </button>
        ))}
      </div>

      <form onSubmit={save} className="max-w-3xl space-y-5 rounded-lg border p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Nama / Label</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-2"><Label>IP / Host</Label><Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required /></div>
          <div className="space-y-2"><Label>Interval Ping (detik)</Label><Input type="number" min={1} value={form.intervalSeconds} onChange={(e) => setForm({ ...form, intervalSeconds: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Timeout per Ping (detik)</Label><Input type="number" min={1} value={form.pingTimeoutSeconds} onChange={(e) => setForm({ ...form, pingTimeoutSeconds: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Notifikasi setelah RTO (detik)</Label><Input type="number" min={1} value={form.rtoThresholdSeconds} onChange={(e) => setForm({ ...form, rtoThresholdSeconds: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Jarak Notifikasi RTO (detik)</Label><Input type="number" min={60} value={form.notificationCooldownSeconds} onChange={(e) => setForm({ ...form, notificationCooldownSeconds: Number(e.target.value) })} /></div>
          <div className="flex items-end gap-6 pb-2">
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.enabled} onCheckedChange={(checked) => setForm({ ...form, enabled: checked })} /> Aktif</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.notifyRecovery} onCheckedChange={(checked) => setForm({ ...form, notifyRecovery: checked })} /> Notif recovery</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.maintenance} onCheckedChange={(checked) => setForm({ ...form, maintenance: checked })} /> Maintenance</label>
          </div>
          <div className="space-y-2 sm:col-span-2"><Label>Label Maintenance</Label><Input value={form.maintenanceLabel ?? ''} onChange={(e) => setForm({ ...form, maintenanceLabel: e.target.value })} placeholder="Maintenance / Mati lampu / pekerjaan jaringan" /></div>
        </div>

        <div className="space-y-2">
          <Label>Jalur Recipient WhatsApp</Label>
          <p className="text-xs text-muted-foreground">Tanpa pilihan: kirim ke semua Ping Recipient aktif. Dengan pilihan: hanya kirim ke recipient terpilih.</p>
          <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
            {recipients.map((recipient) => (
              <label key={recipient.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.recipientIds.includes(recipient.id)} onChange={(e) => setForm({ ...form, recipientIds: e.target.checked ? [...form.recipientIds, recipient.id] : form.recipientIds.filter((id) => id !== recipient.id) })} />
                {recipient.label || recipient.phoneNumber}
              </label>
            ))}
            {recipients.length === 0 && <span className="text-sm text-muted-foreground">Belum ada monitoring recipient.</span>}
          </div>
        </div>

        <div className="space-y-2"><Label>Template Alert RTO</Label><Textarea rows={5} value={form.alertTemplate} onChange={(e) => setForm({ ...form, alertTemplate: e.target.value })} /></div>
        <div className="space-y-2"><Label>Template Recovery</Label><Textarea rows={5} value={form.recoveryTemplate} onChange={(e) => setForm({ ...form, recoveryTemplate: e.target.value })} /></div>
        <p className="text-xs text-muted-foreground">Placeholder: {'{label}'}, {'{host}'}, {'{status}'}, {'{latencyMs}'}, {'{outageSeconds}'}, {'{time}'}</p>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          {selected && <Button type="button" variant="outline" onClick={async () => { const result = await pingMonitorApi.poll(selected.id); await load(); toast.success(result.lastLatencyMs === null ? 'Ping RTO' : `Ping ${result.lastLatencyMs.toFixed(1)} ms`); }}><RefreshCw className="h-4 w-4" /> Test Ping</Button>}
          {selected && <Button type="button" variant="destructive" onClick={async () => { if (!confirm(`Hapus ${selected.name}?`)) return; await pingMonitorApi.remove(selected.id); setSelectedId(null); setForm(emptyForm); await load(); }}><Trash2 className="h-4 w-4" /> Hapus</Button>}
          {selected && <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground"><Activity className="h-4 w-4" /> {selected.status} {selected.lastLatencyMs !== null ? `${selected.lastLatencyMs.toFixed(1)} ms` : ''}</span>}
        </div>
      </form>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Live Ping Logs</DialogTitle>
          </DialogHeader>
          <div className="bg-slate-950 text-slate-300 font-mono text-xs rounded-md p-4 h-[500px] overflow-y-auto space-y-1">
            {logs.length === 0 ? (
              <div className="text-muted-foreground italic">Menunggu log...</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="flex gap-4">
                  <span className="text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="text-blue-400 w-32 truncate">{log.name}</span>
                  <span className="text-amber-200/70 w-32 truncate">{log.host}</span>
                  <span className={`w-12 font-bold ${log.status === 'UP' ? 'text-emerald-400' : 'text-red-400'}`}>{log.status}</span>
                  <span className="text-slate-400">{log.latencyMs === 'N/A' || log.latencyMs === null ? 'N/A' : log.latencyMs}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

