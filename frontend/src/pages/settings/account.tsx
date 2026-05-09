import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Save, User } from 'lucide-react';

export default function AccountPage() {
  const { user } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Password saat ini wajib diisi');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError('Password baru dan konfirmasi tidak cocok');
      return;
    }

    if (!username.trim() && !newPassword) {
      setError('Isi username baru atau password baru');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, string> = { currentPassword };
      if (username.trim() && username !== user?.username) {
        payload.username = username.trim();
      }
      if (newPassword) {
        payload.newPassword = newPassword;
      }

      await api.put('/api/auth/me', payload);
      toast.success('Akun berhasil diperbarui');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        (err instanceof Error ? err.message : 'Gagal memperbarui akun');
      toast.error(message);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Akun</h1>
        <p className="mt-1 text-muted-foreground">
          Ubah username dan password login.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="max-w-md space-y-6">
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-medium">Informasi Akun</legend>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="Username baru"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Kosongkan jika tidak ingin mengubah username.
            </p>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-medium">Ubah Password</legend>

          <div className="space-y-2">
            <Label htmlFor="current-password">Password Saat Ini *</Label>
            <Input
              id="current-password"
              type="password"
              placeholder="Masukkan password saat ini"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">Password Baru</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Kosongkan jika tidak ingin ganti"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Ulangi password baru"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </fieldset>

        <Button type="submit" disabled={saving}>
          <Save className="size-4" data-icon="inline-start" />
          {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
        </Button>
      </form>
    </div>
  );
}
