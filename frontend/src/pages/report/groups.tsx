import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { prtgGroupApi } from '@/lib/api';
import type { PrtgGroup } from '@/lib/types';
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
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface GroupForm {
  name: string;
  enabled: boolean;
}

const emptyForm: GroupForm = { name: '', enabled: true };

export default function ReportGroupsPage() {
  const [groups, setGroups] = useState<PrtgGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyForm);

  const fetchGroups = async () => {
    try {
      const data = await prtgGroupApi.getAll();
      setGroups(data);
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGroups();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (group: PrtgGroup) => {
    setEditingId(group.id);
    setForm({ name: group.name, enabled: group.enabled });
    setDialogOpen(true);
  };

  const openDelete = (id: number) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await prtgGroupApi.update(editingId, form);
      } else {
        await prtgGroupApi.create(form);
      }
      setDialogOpen(false);
      toast.success(editingId ? 'Group berhasil diperbarui' : 'Group berhasil dibuat');
      fetchGroups();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menyimpan group: ' + message);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await prtgGroupApi.remove(deletingId);
      setDeleteDialogOpen(false);
      setDeletingId(null);
      toast.success('Group berhasil dihapus');
      fetchGroups();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error('Gagal menghapus group: ' + message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Report Groups</h1>
          <p className="text-sm text-muted-foreground">Manage PRTG report groups.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus data-icon="inline-start" /> Add Group
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">No groups found.</TableCell>
              </TableRow>
            ) : (
              groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>
                    <Badge variant={group.enabled ? 'default' : 'secondary'}>
                      {group.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(group.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(group)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openDelete(group.id)}>
                        <Trash2 />
                      </Button>
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
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Group' : 'Create Group'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Group name"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="size-4 rounded border-input"
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
            <DialogFooter>
              <Button type="submit">{editingId ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this group? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
