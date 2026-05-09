import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cookieVaultApi } from '@/lib/api';
import type { PrtgCookie } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';

export default function CookieVaultPage() {
  const [cookies, setCookies] = useState<PrtgCookie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCookie, setEditingCookie] = useState<PrtgCookie | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCookie, setDeletingCookie] = useState<PrtgCookie | null>(null);

  // Form state
  const [formLabel, setFormLabel] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formIsActive, setFormIsActive] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const hasActiveCookie = cookies.some((c) => c.isActive);

  useEffect(() => {
    loadCookies();
  }, []);

  async function loadCookies() {
    try {
      setLoading(true);
      const data = await cookieVaultApi.getAll();
      setCookies(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cookies');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingCookie(null);
    setFormLabel('');
    setFormValue('');
    setFormIsActive(false);
    setDialogOpen(true);
  }

  function openEditDialog(cookie: PrtgCookie) {
    setEditingCookie(cookie);
    setFormLabel(cookie.label);
    setFormValue(cookie.value);
    setFormIsActive(cookie.isActive);
    setDialogOpen(true);
  }

  function openDeleteDialog(cookie: PrtgCookie) {
    setDeletingCookie(cookie);
    setDeleteDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormSubmitting(true);

    try {
      if (editingCookie) {
        await cookieVaultApi.update(editingCookie.id, {
          label: formLabel,
          value: formValue,
          isActive: formIsActive,
        });
        toast.success('Cookie berhasil diperbarui');
      } else {
        await cookieVaultApi.create({
          label: formLabel,
          value: formValue,
          isActive: formIsActive,
        });
        toast.success('Cookie berhasil dibuat');
      }
      setDialogOpen(false);
      await loadCookies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan cookie';
      toast.error(message);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deletingCookie) return;
    setFormSubmitting(true);

    try {
      await cookieVaultApi.remove(deletingCookie.id);
      toast.success('Cookie berhasil dihapus');
      setDeleteDialogOpen(false);
      setDeletingCookie(null);
      await loadCookies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus cookie';
      toast.error(message);
    } finally {
      setFormSubmitting(false);
    }
  }

  function truncateValue(value: string, maxLength = 40): string {
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + '…';
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cookie Vault</h1>
          <p className="mt-1 text-muted-foreground">
            Manage PRTG authentication cookies.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button onClick={openCreateDialog}>
                <Plus className="size-4" data-icon="inline-start" />
                Add Cookie
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingCookie ? 'Edit Cookie' : 'Add Cookie'}
                </DialogTitle>
                <DialogDescription>
                  {editingCookie
                    ? 'Update the cookie label, value, or active state.'
                    : 'Add a new PRTG authentication cookie.'}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cookie-label">Label</Label>
                  <Input
                    id="cookie-label"
                    placeholder="e.g. Production Cookie"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cookie-value">Value / cURL Command</Label>
                  <Input
                    id="cookie-value"
                    placeholder="Paste cookie value or cURL command"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="cookie-active"
                    checked={formIsActive}
                    onCheckedChange={setFormIsActive}
                  />
                  <Label htmlFor="cookie-active">Set as active cookie</Label>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={formSubmitting}>
                  {formSubmitting
                    ? 'Saving…'
                    : editingCookie
                      ? 'Update'
                      : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Warning if no active cookie */}
      {!loading && !hasActiveCookie && cookies.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>No Active Cookie</AlertTitle>
          <AlertDescription>
            No cookie is currently active. PRTG requests will fail until an
            active cookie is set.
          </AlertDescription>
        </Alert>
      )}

      {/* Error message */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Cookie table */}
      {loading ? (
        <p className="text-muted-foreground">Loading cookies…</p>
      ) : cookies.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No cookies stored yet. Add one to get started.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cookies.map((cookie) => (
              <TableRow
                key={cookie.id}
                className={cookie.isActive ? 'bg-primary/5' : undefined}
              >
                <TableCell className="font-medium">{cookie.label}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {truncateValue(cookie.value)}
                  </code>
                </TableCell>
                <TableCell>
                  {cookie.isActive ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(cookie.createdAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(cookie.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEditDialog(cookie)}
                      aria-label={`Edit ${cookie.label}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openDeleteDialog(cookie)}
                      aria-label={`Delete ${cookie.label}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Cookie</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingCookie?.label}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={formSubmitting}
            >
              {formSubmitting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
