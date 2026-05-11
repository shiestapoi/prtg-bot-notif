import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { prtgConfigApi, prtgGroupApi } from '@/lib/api';
import api from '@/lib/api';
import type { PrtgConfig, PrtgGroup, NocSensitivity } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, Search, FlaskConical } from 'lucide-react';

// ─── Form Types ─────────────────────────────────────────────────────────────

interface ConfigForm {
  title: string;
  sensorId: number | '';
  groupId: number | '';
  enabled: boolean;
  // Monitoring fields
  monitoringEnabled: boolean;
  pollingInterval: number;
  thresholdLow: number;
  thresholdHigh: number;
  sensitivity: NocSensitivity;
  cooldownInterval: number;
  noTrafficCount: number;
  flappingWindow: number;
  flappingCount: number;
  downCount: number;
  rollingWindowSize: number;
  // Notification switches
  notifyDown: boolean;
  notifyNoTraffic: boolean;
  notifyLowTraffic: boolean;
  notifyFlapping: boolean;
  notifyRecovery: boolean;
}

interface ValidationErrors {
  sensorId?: string;
  pollingInterval?: string;
  thresholdLow?: string;
  thresholdHigh?: string;
  sensitivity?: string;
  cooldownInterval?: string;
  noTrafficCount?: string;
  flappingWindow?: string;
  flappingCount?: string;
  downCount?: string;
  rollingWindowSize?: string;
}

const emptyForm: ConfigForm = {
  title: '',
  sensorId: '',
  groupId: '',
  enabled: true,
  monitoringEnabled: false,
  pollingInterval: 60,
  thresholdLow: 30.0,
  thresholdHigh: 90.0,
  sensitivity: 'MEDIUM',
  cooldownInterval: 300,
  noTrafficCount: 3,
  flappingWindow: 600,
  flappingCount: 4,
  downCount: 3,
  rollingWindowSize: 10,
  notifyDown: true,
  notifyNoTraffic: true,
  notifyLowTraffic: true,
  notifyFlapping: true,
  notifyRecovery: true,
};

// ─── Validation ─────────────────────────────────────────────────────────────

function validateForm(form: ConfigForm): ValidationErrors {
  const errors: ValidationErrors = {};

  if (form.sensorId === '' || !Number.isInteger(form.sensorId) || form.sensorId < 1) {
    errors.sensorId = 'Sensor ID harus integer >= 1';
  }

  // Only validate monitoring threshold fields when monitoring is enabled
  if (!form.monitoringEnabled) return errors;

  if (!Number.isInteger(form.pollingInterval) || form.pollingInterval < 30) {
    errors.pollingInterval = 'Minimum polling interval is 30 seconds';
  }

  if (form.thresholdLow < 0 || form.thresholdLow > 100) {
    errors.thresholdLow = 'Must be between 0 and 100';
  }

  if (form.thresholdHigh < 0 || form.thresholdHigh > 100) {
    errors.thresholdHigh = 'Must be between 0 and 100';
  }

  if (!['LOW', 'MEDIUM', 'HIGH'].includes(form.sensitivity)) {
    errors.sensitivity = 'Must be LOW, MEDIUM, or HIGH';
  }

  if (form.cooldownInterval < 0) {
    errors.cooldownInterval = 'Must be 0 or greater';
  }

  if (!Number.isInteger(form.noTrafficCount) || form.noTrafficCount < 1) {
    errors.noTrafficCount = 'Must be at least 1';
  }

  if (!Number.isInteger(form.flappingWindow) || form.flappingWindow < 60) {
    errors.flappingWindow = 'Must be at least 60 seconds';
  }

  if (!Number.isInteger(form.flappingCount) || form.flappingCount < 2) {
    errors.flappingCount = 'Must be at least 2';
  }

  if (!Number.isInteger(form.downCount) || form.downCount < 1) {
    errors.downCount = 'Must be at least 1';
  }

  if (!Number.isInteger(form.rollingWindowSize) || form.rollingWindowSize < 1 || form.rollingWindowSize > 100) {
    errors.rollingWindowSize = 'Must be between 1 and 100';
  }

  return errors;
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function ReportConfigsPage() {
  const [configs, setConfigs] = useState<PrtgConfig[]>([]);
  const [groups, setGroups] = useState<PrtgGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResults, setTestResults] = useState<Array<{
    configId: number;
    title: string;
    sensorId: number;
    status: 'pending' | 'ok' | 'error';
    error?: string;
  }>>([]);
  const [form, setForm] = useState<ConfigForm>(emptyForm);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Search & Filter
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('');

  const fetchData = async () => {
    try {
      const [configData, groupData] = await Promise.all([
        prtgConfigApi.getAll(),
        prtgGroupApi.getAll(),
      ]);
      setConfigs(configData);
      setGroups(groupData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredConfigs = useMemo(() => {
    let result = configs;
    if (filterGroup !== '') {
      result = result.filter((c) => c.groupId === Number(filterGroup));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.title.toLowerCase().includes(q) || String(c.sensorId).includes(q),
      );
    }
    return result;
  }, [configs, filterGroup, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setValidationErrors({});
    setDialogOpen(true);
  };

  const openEdit = (config: PrtgConfig) => {
    setEditingId(config.id);
    setForm({
      title: config.title,
      sensorId: config.sensorId,
      groupId: config.groupId,
      enabled: config.enabled,
      monitoringEnabled: config.monitoringEnabled,
      pollingInterval: config.pollingInterval ?? 60,
      thresholdLow: config.thresholdLow ?? 30.0,
      thresholdHigh: config.thresholdHigh ?? 90.0,
      sensitivity: config.sensitivity ?? 'MEDIUM',
      cooldownInterval: config.cooldownInterval ?? 300,
      noTrafficCount: config.noTrafficCount ?? 3,
      flappingWindow: config.flappingWindow ?? 600,
      flappingCount: config.flappingCount ?? 4,
      downCount: config.downCount ?? 3,
      rollingWindowSize: config.rollingWindowSize ?? 10,
      notifyDown: config.notifyDown ?? true,
      notifyNoTraffic: config.notifyNoTraffic ?? true,
      notifyLowTraffic: config.notifyLowTraffic ?? true,
      notifyFlapping: config.notifyFlapping ?? true,
      notifyRecovery: config.notifyRecovery ?? true,
    });
    setValidationErrors({});
    setDialogOpen(true);
  };

  const openDelete = (id: number) => { setDeletingId(id); setDeleteDialogOpen(true); };

  const handleTestSample = async () => {
    setTestLoading(true);
    setTestResults(configs.map(c => ({ configId: c.id, title: c.title, sensorId: c.sensorId, status: 'pending' as const })));
    setTestDialogOpen(true);

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      try {
        await api.post(`/api/monitoring/configs/${config.id}/test-sample`);
        setTestResults(prev => prev.map(r => r.configId === config.id ? { ...r, status: 'ok' as const } : r));
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          || (err instanceof Error ? err.message : 'Gagal');
        setTestResults(prev => prev.map(r => r.configId === config.id ? { ...r, status: 'error' as const, error: message } : r));
      }
    }
    setTestLoading(false);
    toast.success('Test sample selesai');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.groupId) {
      toast.warning('Pilih group terlebih dahulu');
      return;
    }

    // Validate form
    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.warning('Periksa form, ada field yang tidak valid');
      return;
    }
    setValidationErrors({});

    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        sensorId: Number(form.sensorId),
        groupId: Number(form.groupId),
        enabled: form.enabled,
        monitoringEnabled: form.monitoringEnabled,
      };

      // Include monitoring threshold fields when monitoring is enabled
      if (form.monitoringEnabled) {
        payload.pollingInterval = form.pollingInterval;
        payload.thresholdLow = form.thresholdLow;
        payload.thresholdHigh = form.thresholdHigh;
        payload.sensitivity = form.sensitivity;
        payload.cooldownInterval = form.cooldownInterval;
        payload.noTrafficCount = form.noTrafficCount;
        payload.flappingWindow = form.flappingWindow;
        payload.flappingCount = form.flappingCount;
        payload.downCount = form.downCount;
        payload.rollingWindowSize = form.rollingWindowSize;
        payload.notifyDown = form.notifyDown;
        payload.notifyNoTraffic = form.notifyNoTraffic;
        payload.notifyLowTraffic = form.notifyLowTraffic;
        payload.notifyFlapping = form.notifyFlapping;
        payload.notifyRecovery = form.notifyRecovery;
      }

      if (editingId) { await prtgConfigApi.update(editingId, payload as any); }
      else { await prtgConfigApi.create(payload as any); }
      setDialogOpen(false);
      toast.success(editingId ? 'Config berhasil diperbarui' : 'Config berhasil dibuat');
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menyimpan config: ' + message);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await prtgConfigApi.remove(deletingId);
      setDeleteDialogOpen(false);
      setDeletingId(null);
      toast.success('Config berhasil dihapus');
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menghapus config: ' + message);
    }
  };

  const getGroupName = (groupId: number) => groups.find((g) => g.id === groupId)?.name ?? `Group #${groupId}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Report Configs</h1>
          <p className="text-sm text-muted-foreground">Manage PRTG chart configurations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTestSample} disabled={testLoading || configs.length === 0}>
            <FlaskConical className="h-4 w-4" /> Test All
          </Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Config</Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title or sensor ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterGroup} onValueChange={(val) => setFilterGroup(val ?? '')}>
          <SelectTrigger className="w-48">
            <span className="flex flex-1 text-left">
              {filterGroup ? groups.find((g) => String(g.id) === filterGroup)?.name ?? `Group #${filterGroup}` : 'All Groups'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Groups</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Sensor ID</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Monitoring</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filteredConfigs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No configs found.</TableCell></TableRow>
            ) : (
              filteredConfigs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">{config.title}</TableCell>
                  <TableCell className="text-muted-foreground">{config.sensorId}</TableCell>
                  <TableCell>{getGroupName(config.groupId)}</TableCell>
                  <TableCell><Badge variant={config.enabled ? 'default' : 'secondary'}>{config.enabled ? 'Enabled' : 'Disabled'}</Badge></TableCell>
                  <TableCell>
                    {config.monitoringEnabled ? (
                      <Badge variant="outline" className="text-xs">Monitored</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{new Date(config.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(config)}><Pencil /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openDelete(config.id)}><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Config' : 'Create Config'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Base fields */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Config title" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sensorId">Sensor ID</Label>
              <Input
                id="sensorId"
                type="number"
                min={1}
                value={form.sensorId}
                onChange={(e) => setForm({ ...form, sensorId: e.target.value === '' ? '' : parseInt(e.target.value) || '' })}
                placeholder="e.g. 2669"
                required
              />
              <p className="text-[10px] text-muted-foreground">ID sensor PRTG (lihat di URL: id=XXXX)</p>
              {validationErrors.sensorId && (
                <p className="text-xs text-destructive">{validationErrors.sensorId}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Group</Label>
              <Select value={form.groupId ? String(form.groupId) : undefined} onValueChange={(val) => setForm({ ...form, groupId: Number(val) })}>
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 text-left">{form.groupId ? groups.find(g => g.id === Number(form.groupId))?.name ?? 'Select a group' : 'Select a group'}</span>
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (<SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="enabled" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="size-4 rounded border-input" />
              <Label htmlFor="enabled">Enabled</Label>
            </div>

            {/* Monitoring Section */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="monitoringEnabled"
                  checked={form.monitoringEnabled}
                  onChange={(e) => setForm({ ...form, monitoringEnabled: e.target.checked })}
                  className="size-4 rounded border-input"
                />
                <Label htmlFor="monitoringEnabled" className="font-medium">Aktifkan Monitoring</Label>
              </div>

              {/* Threshold fields - shown only when monitoring is enabled */}
              {form.monitoringEnabled && (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="pollingInterval" className="text-xs">Polling Interval (sec)</Label>
                      <Input
                        id="pollingInterval"
                        type="number"
                        min={30}
                        value={form.pollingInterval}
                        onChange={(e) => setForm({ ...form, pollingInterval: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Seberapa sering cek data (min 30 detik)</p>
                      {validationErrors.pollingInterval && (
                        <p className="text-xs text-destructive">{validationErrors.pollingInterval}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sensitivity" className="text-xs">Sensitivity</Label>
                      <Select value={form.sensitivity} onValueChange={(val) => setForm({ ...form, sensitivity: val as NocSensitivity })}>
                        <SelectTrigger className="w-full" id="sensitivity">
                          <span className="flex flex-1 text-left">{form.sensitivity}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">LOW — Jarang alert (hanya DOWN & NO_TRAFFIC)</SelectItem>
                          <SelectItem value="MEDIUM">MEDIUM — Seimbang (DOWN, NO_TRAFFIC, LOW_TRAFFIC)</SelectItem>
                          <SelectItem value="HIGH">HIGH — Semua anomali kirim notifikasi</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Menentukan status mana yang kirim notifikasi ke recipient</p>
                      {validationErrors.sensitivity && (
                        <p className="text-xs text-destructive">{validationErrors.sensitivity}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="thresholdLow" className="text-xs">Threshold Low (%)</Label>
                      <Input
                        id="thresholdLow"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={form.thresholdLow}
                        onChange={(e) => setForm({ ...form, thresholdLow: parseFloat(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Alert jika traffic turun di bawah X% dari rata-rata</p>
                      {validationErrors.thresholdLow && (
                        <p className="text-xs text-destructive">{validationErrors.thresholdLow}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="thresholdHigh" className="text-xs">Threshold High (%)</Label>
                      <Input
                        id="thresholdHigh"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={form.thresholdHigh}
                        onChange={(e) => setForm({ ...form, thresholdHigh: parseFloat(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Alert jika utilisasi melebihi X%</p>
                      {validationErrors.thresholdHigh && (
                        <p className="text-xs text-destructive">{validationErrors.thresholdHigh}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="cooldownInterval" className="text-xs">Cooldown (sec)</Label>
                      <Input
                        id="cooldownInterval"
                        type="number"
                        min={0}
                        value={form.cooldownInterval}
                        onChange={(e) => setForm({ ...form, cooldownInterval: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Jeda antar notifikasi agar tidak spam</p>
                      {validationErrors.cooldownInterval && (
                        <p className="text-xs text-destructive">{validationErrors.cooldownInterval}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="noTrafficCount" className="text-xs">No Traffic Count</Label>
                      <Input
                        id="noTrafficCount"
                        type="number"
                        min={1}
                        value={form.noTrafficCount}
                        onChange={(e) => setForm({ ...form, noTrafficCount: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Berapa kali berturut-turut traffic 0 sebelum alert</p>
                      {validationErrors.noTrafficCount && (
                        <p className="text-xs text-destructive">{validationErrors.noTrafficCount}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="flappingWindow" className="text-xs">Flapping Window (sec)</Label>
                      <Input
                        id="flappingWindow"
                        type="number"
                        min={60}
                        value={form.flappingWindow}
                        onChange={(e) => setForm({ ...form, flappingWindow: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Rentang waktu untuk deteksi status naik-turun</p>
                      {validationErrors.flappingWindow && (
                        <p className="text-xs text-destructive">{validationErrors.flappingWindow}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="flappingCount" className="text-xs">Flapping Count</Label>
                      <Input
                        id="flappingCount"
                        type="number"
                        min={2}
                        value={form.flappingCount}
                        onChange={(e) => setForm({ ...form, flappingCount: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Berapa kali status berubah-ubah = flapping</p>
                      {validationErrors.flappingCount && (
                        <p className="text-xs text-destructive">{validationErrors.flappingCount}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="downCount" className="text-xs">Down Count</Label>
                      <Input
                        id="downCount"
                        type="number"
                        min={1}
                        value={form.downCount}
                        onChange={(e) => setForm({ ...form, downCount: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Berapa kali gagal berturut-turut = DOWN</p>
                      {validationErrors.downCount && (
                        <p className="text-xs text-destructive">{validationErrors.downCount}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rollingWindowSize" className="text-xs">Rolling Window Size</Label>
                      <Input
                        id="rollingWindowSize"
                        type="number"
                        min={1}
                        max={100}
                        value={form.rollingWindowSize}
                        onChange={(e) => setForm({ ...form, rollingWindowSize: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-[10px] text-muted-foreground">Jumlah sample untuk hitung rata-rata traffic</p>
                      {validationErrors.rollingWindowSize && (
                        <p className="text-xs text-destructive">{validationErrors.rollingWindowSize}</p>
                      )}
                    </div>
                  </div>

                  {/* Notification switches */}
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-muted-foreground">Kirim notifikasi untuk status:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={form.notifyDown} onChange={(e) => setForm({ ...form, notifyDown: e.target.checked, notifyNoTraffic: e.target.checked })} className="size-3.5" />
                        🔴 Down / No Traffic
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={form.notifyLowTraffic} onChange={(e) => setForm({ ...form, notifyLowTraffic: e.target.checked })} className="size-3.5" />
                        🟡 Low Traffic
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={form.notifyFlapping} onChange={(e) => setForm({ ...form, notifyFlapping: e.target.checked })} className="size-3.5" />
                        ⚪ Flapping
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={form.notifyRecovery} onChange={(e) => setForm({ ...form, notifyRecovery: e.target.checked })} className="size-3.5" />
                        ✅ Recovery
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter><Button type="submit">{editingId ? 'Update' : 'Create'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Config</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure? This action cannot be undone.</p>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Sample All Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Test Sample — Semua Config</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {testResults.map((r) => (
              <div key={r.configId} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{r.title}</span>
                  <span className="text-xs text-muted-foreground">#{r.sensorId}</span>
                </div>
                <div>
                  {r.status === 'pending' && <Badge variant="secondary">Pending...</Badge>}
                  {r.status === 'ok' && <Badge variant="default" className="bg-green-600">OK</Badge>}
                  {r.status === 'error' && (
                    <Badge variant="destructive" title={r.error}>Error</Badge>
                  )}
                </div>
              </div>
            ))}
            {testLoading && (
              <p className="text-center text-sm text-muted-foreground pt-2">
                Sedang memproses {testResults.filter(r => r.status === 'pending').length} config tersisa...
              </p>
            )}
            {!testLoading && testResults.length > 0 && (
              <p className="text-center text-sm text-muted-foreground pt-2">
                ✅ {testResults.filter(r => r.status === 'ok').length} OK
                {testResults.filter(r => r.status === 'error').length > 0 && (
                  <> · ❌ {testResults.filter(r => r.status === 'error').length} Error</>
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
