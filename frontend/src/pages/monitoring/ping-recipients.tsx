import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { pingRecipientApi, whatsappApi, type PingRecipient, type WhatsappTarget } from '@/lib/api';
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
  enabled: boolean;
}

const emptyForm: RecipientForm = {
  label: '', phoneNumber: '', targetType: 'contact', enabled: true,
};

export default function PingRecipientsPage() {
  const [recipients, setRecipients] = useState<PingRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<RecipientForm>(emptyForm);
  const [search, setSearch] = useState('');
  const [waTargets, setWaTargets] = useState<WhatsappTarget[]>([]);
  const [waTargetSearch, setWaTargetSearch] = useState('');
  const [loadingTargets, setLoadingTargets] = useState(false);

  const fetchData = async () => {
    try {
      setRecipients(await pingRecipientApi.getAll());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(); }, []);

  const loadWaTargets = async () => {
    setLoadingTargets(true);
    try {
      setWaTargets(await whatsappApi.getTargets());
    } finally {
      setLoadingTargets(false);
    }
  };

  const filteredWaTargets = useMemo(() => {
    let targets = waTargets.filter((target) => target.type === form.targetType);
    if (waTargetSearch.trim()) {
      const query = waTargetSearch.toLowerCase();
      targets = targets.filter(
        (target) => target.label.toLowerCase().includes(query) || target.jid.toLowerCase().includes(query),
      );
    }
    return targets;
  }, [waTargets, form.targetType, waTargetSearch]);

  const filteredRecipients = useMemo(() => {
    if (!search.trim()) return recipients;
    const query = search.toLowerCase();
    return recipients.filter(
      (recipient) => (recipient.label ?? '').toLowerCase().includes(query) || recipient.phoneNumber.toLowerCase().includes(query),
    );
  }, [recipients, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setWaTargetSearch('');
    setDialogOpen(true);
    void loadWaTargets();
  };

  const openEdit = (recipient: PingRecipient) => {
    setEditingId(recipient.id);
    setForm({
      label: recipient.label ?? '',
      phoneNumber: recipient.phoneNumber,
      targetType: recipient.targetType,
      enabled: recipient.enabled,
    });
    setWaTargetSearch('');
    setDialogOpen(true);
    void loadWaTargets();
  };

  const selectTarget = (target: WhatsappTarget) => {
    setForm({ ...form, label: target.label || form.label, phoneNumber: target.jid });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) {
        await pingRecipientApi.update(editingId, form);
      } else {
        await pingRecipientApi.create(form);
      }
      setDialogOpen(false);
      toast.success(editingId ? 'Ping recipient diperbarui' : 'Ping recipient dibuat');
      void fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan recipient');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await pingRecipientApi.remove(deletingId);
    setDeleteDialogOpen(false);
    setDeletingId(null);
    toast.success('Ping recipient dihapus');
    void fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ping Recipients</h1>
          <p className="text-sm text-muted-foreground">Jalur WhatsApp khusus untuk notifikasi ping monitoring.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Recipient</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or number..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Phone / JID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filteredRecipients.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No ping recipients found.</TableCell></TableRow>
            ) : (
              filteredRecipients.map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableCell className="font-medium">{recipient.label ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{recipient.phoneNumber}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{recipient.targetType}</Badge></TableCell>
                  <TableCell><Badge variant={recipient.enabled ? 'default' : 'secondary'}>{recipient.enabled ? 'Enabled' : 'Disabled'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(recipient)}><Pencil /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => { setDeletingId(recipient.id); setDeleteDialogOpen(true); }}><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Ping Recipient' : 'Add Ping Recipient'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Target Type</Label>
              <Select value={form.targetType} onValueChange={(value) => { setForm({ ...form, targetType: value ?? 'contact', phoneNumber: '', label: '' }); setWaTargetSearch(''); }}>
                <SelectTrigger className="w-full"><span className="flex flex-1 text-left capitalize">{form.targetType}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="channel">Channel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Pick from WhatsApp {form.targetType === 'contact' ? 'Contacts' : form.targetType === 'group' ? 'Groups' : 'Channels'}</Label>
              <Select value={form.phoneNumber || ''} onValueChange={(value) => {
                const target = filteredWaTargets.find((item) => item.jid === value);
                if (target) selectTarget(target);
              }}>
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 text-left truncate">
                    {form.phoneNumber ? (filteredWaTargets.find((target) => target.jid === form.phoneNumber)?.label || form.phoneNumber) : (loadingTargets ? 'Loading...' : `Select a ${form.targetType}`)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <Input
                      placeholder={`Search ${form.targetType}s...`}
                      value={waTargetSearch}
                      onChange={(event) => setWaTargetSearch(event.target.value)}
                      className="h-8 text-xs"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  {filteredWaTargets.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No {form.targetType}s found.</div>
                  ) : (
                    filteredWaTargets.map((target) => (
                      <SelectItem key={target.jid} value={target.jid}>{target.label || target.jid}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2"><Label>Label</Label><Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></div>
            <div className="space-y-2"><Label>Phone / JID</Label><Input value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} required /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="enabled" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="size-4 rounded border-input" />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
            <DialogFooter><Button type="submit">{editingId ? 'Update' : 'Create'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Ping Recipient</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure? This action cannot be undone.</p>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
