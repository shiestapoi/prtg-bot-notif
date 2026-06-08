import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { prtgRecipientApi, prtgGroupApi, whatsappApi, type WhatsappTarget } from '@/lib/api';
import type { PrtgRecipient, PrtgGroup } from '@/lib/types';
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
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

interface RecipientForm {
  label: string;
  phoneNumber: string;
  targetType: string;
  groupId: number | '';
  isAdmin: boolean;
  enabled: boolean;
}

const emptyForm: RecipientForm = {
  label: '', phoneNumber: '', targetType: 'contact', groupId: '', isAdmin: false, enabled: true,
};

export default function ReportRecipientsPage() {
  const [recipients, setRecipients] = useState<PrtgRecipient[]>([]);
  const [groups, setGroups] = useState<PrtgGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<RecipientForm>(emptyForm);

  // Search & Filter
  const [search, setSearch] = useState('');

  // WhatsApp targets for picker
  const [waTargets, setWaTargets] = useState<WhatsappTarget[]>([]);
  const [waTargetSearch, setWaTargetSearch] = useState('');
  const [loadingTargets, setLoadingTargets] = useState(false);

  const fetchData = async () => {
    try {
      const [recipientData, groupData] = await Promise.all([
        prtgRecipientApi.getAll(),
        prtgGroupApi.getAll(),
      ]);
      setRecipients(recipientData);
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

  // Load WhatsApp targets when dialog opens
  const loadWaTargets = async () => {
    setLoadingTargets(true);
    try {
      const targets = await whatsappApi.getTargets();
      setWaTargets(targets);
    } catch (err) {
      console.error('Failed to load WhatsApp targets:', err);
    } finally {
      setLoadingTargets(false);
    }
  };

  // Filter targets by selected type and search
  const filteredWaTargets = useMemo(() => {
    let targets = waTargets.filter((t) => t.type === form.targetType);
    if (waTargetSearch.trim()) {
      const q = waTargetSearch.toLowerCase();
      targets = targets.filter(
        (t) => t.label.toLowerCase().includes(q) || t.jid.toLowerCase().includes(q),
      );
    }
    return targets;
  }, [waTargets, form.targetType, waTargetSearch]);

  // Filter recipients by search
  const filteredRecipients = useMemo(() => {
    if (!search.trim()) return recipients;
    const q = search.toLowerCase();
    return recipients.filter(
      (r) => r.label.toLowerCase().includes(q) || r.phoneNumber.toLowerCase().includes(q),
    );
  }, [recipients, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setWaTargetSearch('');
    setDialogOpen(true);
    loadWaTargets();
  };

  const openEdit = (recipient: PrtgRecipient) => {
    setEditingId(recipient.id);
    setForm({
      label: recipient.label,
      phoneNumber: recipient.phoneNumber,
      targetType: recipient.targetType,
      groupId: recipient.groupId,
      isAdmin: recipient.isAdmin,
      enabled: recipient.enabled,
    });
    setWaTargetSearch('');
    setDialogOpen(true);
    loadWaTargets();
  };

  const openDelete = (id: number) => { setDeletingId(id); setDeleteDialogOpen(true); };

  const selectTarget = (target: WhatsappTarget) => {
    setForm({
      ...form,
      label: target.label || form.label,
      phoneNumber: target.jid,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        groupId: form.groupId ? Number(form.groupId) : undefined,
      };
      if (editingId) { await prtgRecipientApi.update(editingId, payload); }
      else { await prtgRecipientApi.create(payload as any); }
      setDialogOpen(false);
      toast.success(editingId ? 'Recipient berhasil diperbarui' : 'Recipient berhasil dibuat');
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menyimpan recipient: ' + message);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await prtgRecipientApi.remove(deletingId);
      setDeleteDialogOpen(false);
      setDeletingId(null);
      toast.success('Recipient berhasil dihapus');
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menghapus recipient: ' + message);
    }
  };

  const getGroupName = (groupId: number) => groups.find((g) => g.id === groupId)?.name ?? `Group #${groupId}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Report Recipients</h1>
          <p className="text-sm text-muted-foreground">Manage report notification recipients.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Recipient</Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Phone / JID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filteredRecipients.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No recipients found.</TableCell></TableRow>
            ) : (
              filteredRecipients.map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableCell className="font-medium">{recipient.label}</TableCell>
                  <TableCell className="font-mono text-xs">{recipient.phoneNumber}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{recipient.targetType}</Badge></TableCell>
                  <TableCell>{recipient.groupId ? getGroupName(recipient.groupId) : '—'}</TableCell>
                  <TableCell>{recipient.isAdmin && <Badge variant="outline">Admin</Badge>}</TableCell>
                  <TableCell><Badge variant={recipient.enabled ? 'default' : 'secondary'}>{recipient.enabled ? 'Enabled' : 'Disabled'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(recipient)}><Pencil /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openDelete(recipient.id)}><Trash2 /></Button>
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
          <DialogHeader><DialogTitle>{editingId ? 'Edit Recipient' : 'Add Recipient'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Target Type */}
            <div className="space-y-2">
              <Label>Target Type</Label>
              <Select value={form.targetType} onValueChange={(val) => { setForm({ ...form, targetType: val ?? 'contact', phoneNumber: '', label: '' }); setWaTargetSearch(''); }}>
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 text-left capitalize">{form.targetType}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="channel">Channel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* WhatsApp Target Picker */}
            <div className="space-y-2">
              <Label>Pick from WhatsApp {form.targetType === 'contact' ? 'Contacts' : form.targetType === 'group' ? 'Groups' : 'Channels'}</Label>
              <Select
                value={form.phoneNumber || ''}
                onValueChange={(val) => {
                  if (!val) return;
                  const target = filteredWaTargets.find((t) => t.jid === val);
                  if (target) selectTarget(target);
                }}
              >
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 text-left truncate">
                    {form.phoneNumber ? (filteredWaTargets.find(t => t.jid === form.phoneNumber)?.label || form.phoneNumber) : (loadingTargets ? 'Loading...' : `Select a ${form.targetType}`)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <Input
                      placeholder={`Search ${form.targetType}s...`}
                      value={waTargetSearch}
                      onChange={(e) => setWaTargetSearch(e.target.value)}
                      className="h-8 text-xs"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  {filteredWaTargets.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No {form.targetType}s found.</div>
                  ) : (
                    filteredWaTargets.map((target) => (
                      <SelectItem key={target.jid} value={target.jid}>
                        {target.label || target.jid}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Manual fields */}
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input id="label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Recipient name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone / JID</Label>
              <Input id="phoneNumber" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="628xxx or JID" required />
            </div>
            <div className="space-y-2">
              <Label>Report Group</Label>
              <Select value={form.groupId ? String(form.groupId) : ''} onValueChange={(val) => setForm({ ...form, groupId: val ? Number(val) : '' })}>
                <SelectTrigger className="w-full"><span className="flex flex-1 text-left">{form.groupId ? groups.find(g => g.id === Number(form.groupId))?.name ?? 'Select group' : 'No group (all)'}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No group (all)</SelectItem>
                  {groups.map((g) => (<SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isAdmin" checked={form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} className="size-4 rounded border-input" />
                <Label htmlFor="isAdmin">Admin</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="enabled" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="size-4 rounded border-input" />
                <Label htmlFor="enabled">Enabled</Label>
              </div>
            </div>
            <DialogFooter><Button type="submit">{editingId ? 'Update' : 'Create'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Recipient</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure? This action cannot be undone.</p>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
