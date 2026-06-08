import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { prtgScheduleApi, prtgGroupApi } from '@/lib/api';
import type { PrtgSchedule, PrtgGroup } from '@/lib/types';
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
import { Plus, Pencil, Trash2, Search, Play } from 'lucide-react';

interface ScheduleForm {
  name: string;
  groupId: number | null;
  cron: string;
  targetMode: string;
  enabled: boolean;
}

const emptyForm: ScheduleForm = { name: '', groupId: null, cron: '', targetMode: 'all', enabled: true };

const targetModeLabels: Record<string, string> = {
  all: 'All (Group + Personal)',
  group_only: 'Group Only',
  personal_only: 'Personal Only',
};

export default function ReportSchedulesPage() {
  const [schedules, setSchedules] = useState<PrtgSchedule[]>([]);
  const [groups, setGroups] = useState<PrtgGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [runningInProgress, setRunningInProgress] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);

  // Search
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    try {
      const [scheduleData, groupData] = await Promise.all([
        prtgScheduleApi.getAll(),
        prtgGroupApi.getAll(),
      ]);
      setSchedules(scheduleData);
      setGroups(groupData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  const filteredSchedules = useMemo(() => {
    if (!search.trim()) return schedules;
    const q = search.toLowerCase();
    return schedules.filter(
      (s) => s.name.toLowerCase().includes(q) || s.cron.toLowerCase().includes(q),
    );
  }, [schedules, search]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (schedule: PrtgSchedule) => {
    setEditingId(schedule.id);
    setForm({
      name: schedule.name,
      groupId: schedule.groupId || null,
      cron: schedule.cron,
      targetMode: schedule.targetMode,
      enabled: schedule.enabled,
    });
    setDialogOpen(true);
  };
  const openDelete = (id: number) => { setDeletingId(id); setDeleteDialogOpen(true); };
  const openRun = (id: number) => { setRunningId(id); setRunDialogOpen(true); };

  const handleRun = async () => {
    if (!runningId) return;
    setRunningInProgress(true);
    try {
      await prtgScheduleApi.run(runningId);
      setRunDialogOpen(false);
      setRunningId(null);
      toast.success('Schedule berhasil di-trigger, report sedang dikirim');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menjalankan schedule: ' + message);
    } finally {
      setRunningInProgress(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        groupId: form.groupId || undefined,
        cron: form.cron,
        targetMode: form.targetMode,
        enabled: form.enabled,
      };
      if (editingId) { await prtgScheduleApi.update(editingId, payload as any); }
      else { await prtgScheduleApi.create(payload as any); }
      setDialogOpen(false);
      toast.success(editingId ? 'Schedule berhasil diperbarui' : 'Schedule berhasil dibuat');
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menyimpan schedule: ' + message);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await prtgScheduleApi.remove(deletingId);
      setDeleteDialogOpen(false);
      setDeletingId(null);
      toast.success('Schedule berhasil dihapus');
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menghapus schedule: ' + message);
    }
  };

  const getGroupName = (groupId: number | null) => {
    if (!groupId) return 'All Groups';
    return groups.find((g) => g.id === groupId)?.name ?? `Group #${groupId}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Report Schedules</h1>
          <p className="text-sm text-muted-foreground">Manage report dispatch schedules.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Schedule</Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or cron..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Report Group</TableHead>
              <TableHead>Cron</TableHead>
              <TableHead>Send To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filteredSchedules.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No schedules found.</TableCell></TableRow>
            ) : (
              filteredSchedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{schedule.name}</TableCell>
                  <TableCell>
                    <Badge variant={schedule.groupId ? 'secondary' : 'outline'}>
                      {getGroupName(schedule.groupId)}
                    </Badge>
                  </TableCell>
                  <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{schedule.cron}</code></TableCell>
                  <TableCell>
                    <Badge variant="secondary">{targetModeLabels[schedule.targetMode] || schedule.targetMode}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={schedule.enabled ? 'default' : 'secondary'}>{schedule.enabled ? 'Enabled' : 'Disabled'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => openRun(schedule.id)} title="Run sekarang"><Play /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(schedule)}><Pencil /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openDelete(schedule.id)}><Trash2 /></Button>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Schedule' : 'Create Schedule'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning Report" required />
            </div>

            <div className="space-y-2">
              <Label>Report Group</Label>
              <p className="text-xs text-muted-foreground">Which group's configs to dispatch. "All Groups" sends all enabled groups.</p>
              <Select
                value={form.groupId ? String(form.groupId) : ''}
                onValueChange={(val) => setForm({ ...form, groupId: val ? Number(val) : null })}
              >
                <SelectTrigger className="w-full"><span className="flex flex-1 text-left">{form.groupId ? groups.find(g => g.id === form.groupId)?.name ?? 'Select group' : 'All Groups'}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Groups</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cron">Cron Expression</Label>
              <Input id="cron" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} placeholder="0 8 * * 1-5" required />
              <p className="text-xs text-muted-foreground">Format: minute hour day month weekday (e.g. "0 8 * * 1-5" = 08:00 Mon-Fri)</p>
            </div>

            <div className="space-y-2">
              <Label>Send To (Target Mode)</Label>
              <p className="text-xs text-muted-foreground">How the report is dispatched to recipients.</p>
              <Select
                value={form.targetMode}
                onValueChange={(val) => setForm({ ...form, targetMode: val ?? 'all' })}
              >
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 text-left">
                    {form.targetMode === 'all' ? 'All (Group + Personal)' : form.targetMode === 'group_only' ? 'Group Only' : form.targetMode === 'personal_only' ? 'Personal Only' : 'Select send mode'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (Group + Personal)</SelectItem>
                  <SelectItem value="group_only">Group Only</SelectItem>
                  <SelectItem value="personal_only">Personal Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="sched-enabled" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="size-4 rounded border-input" />
              <Label htmlFor="sched-enabled">Enabled</Label>
            </div>
            <DialogFooter><Button type="submit">{editingId ? 'Update' : 'Create'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Schedule</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Confirmation Dialog */}
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Jalankan Schedule</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Trigger schedule ini sekarang? Report akan langsung dikirim ke semua recipient yang aktif.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogOpen(false)}>Batal</Button>
            <Button onClick={handleRun} disabled={runningInProgress}>
              <Play className="h-4 w-4" />
              {runningInProgress ? 'Mengirim...' : 'Jalankan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
