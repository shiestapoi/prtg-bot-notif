import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { prtgSettingApi, telegramAdminApi } from '@/lib/api';
import type { PrtgSetting, TelegramUser } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, RefreshCw, Shield, Ban, CheckCircle, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function TelegramPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [sendingDebug, setSendingDebug] = useState(false);
  
  // Settings state
  const [botToken, setBotToken] = useState('');
  const [secretCode, setSecretCode] = useState('');

  // Users state
  const [users, setUsers] = useState<TelegramUser[]>([]);

  useEffect(() => {
    void loadSettings();
    void loadUsers();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const data: PrtgSetting = await prtgSettingApi.get();
      setBotToken(data.telegramBotToken || '');
      setSecretCode(data.telegramSecretCode || '');
    } catch (err) {
      toast.error('Gagal memuat pengaturan Telegram');
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      setUsersLoading(true);
      const data = await telegramAdminApi.getUsers();
      setUsers(data);
    } catch (err) {
      toast.error('Gagal memuat daftar pengguna Telegram');
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      await prtgSettingApi.update({
        telegramBotToken: botToken,
        telegramSecretCode: secretCode,
      });
      toast.success('Pengaturan Telegram berhasil disimpan');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReloadBot() {
    try {
      const res = await telegramAdminApi.reloadBot();
      if (res.success) {
        toast.success('Bot Telegram berhasil di-reload');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal reload bot';
      toast.error(message);
    }
  }

  async function handleSendDebug() {
    setSendingDebug(true);
    try {
      const res = await telegramAdminApi.debugNotification();
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error('Gagal mengirim notifikasi debug');
    } finally {
      setSendingDebug(false);
    }
  }

  async function handleToggleVerify(id: string, currentStatus: boolean) {
    try {
      await telegramAdminApi.verifyUser(id, !currentStatus);
      toast.success(!currentStatus ? 'User diverifikasi' : 'Verifikasi user dibatalkan');
      void loadUsers();
    } catch (err) {
      toast.error('Gagal mengubah status verifikasi');
    }
  }

  async function handleToggleBlock(id: string, currentStatus: boolean) {
    try {
      await telegramAdminApi.blockUser(id, !currentStatus);
      toast.success(!currentStatus ? 'User diblokir' : 'Blokir user dibuka');
      void loadUsers();
    } catch (err) {
      toast.error('Gagal mengubah status blokir');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Telegram</h1>
          <p className="mt-1 text-muted-foreground">Memuat pengaturan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Telegram</h1>
          <p className="mt-1 text-muted-foreground">
            Konfigurasi Bot Telegram dan kelola pengguna.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSendDebug} disabled={sendingDebug}>
            <ShieldAlert className={`mr-2 h-4 w-4 ${sendingDebug ? 'animate-pulse' : ''}`} />
            Test Notifikasi Traffic (Debug)
          </Button>
          <Button variant="outline" onClick={handleReloadBot}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload Bot
          </Button>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <div className="space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-4 rounded-lg border p-4 bg-card">
            <h2 className="text-lg font-semibold">Konfigurasi Bot</h2>
            
            <div className="space-y-2">
              <Label htmlFor="bot-token">Bot Token</Label>
              <Input
                id="bot-token"
                type="text"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Token dari BotFather.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret-code">Secret Code</Label>
              <Input
                id="secret-code"
                type="text"
                placeholder="KODE-RAHASIA-123"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Kode ini diperlukan pengguna saat pertama kali chat ke bot untuk verifikasi (contoh: /start KODE-RAHASIA).
              </p>
            </div>

            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </Button>
          </form>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-muted/20">
          <h2 className="text-lg font-semibold">Pengguna Telegram</h2>
          <Button variant="ghost" size="sm" onClick={loadUsers} disabled={usersLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${usersLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Telegram ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Belum ada pengguna Telegram yang terhubung.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName || ''}
                  </TableCell>
                  <TableCell>
                    {user.username ? `@${user.username}` : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.telegramId.toString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {user.isBlocked ? (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <Ban className="h-3 w-3" /> Blocked
                        </Badge>
                      ) : user.isVerified ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" /> Pending
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant={user.isVerified ? "outline" : "default"}
                        size="sm"
                        onClick={() => handleToggleVerify(user.id, user.isVerified)}
                        disabled={user.isBlocked}
                      >
                        <Shield className="h-4 w-4 mr-1" />
                        {user.isVerified ? 'Unverify' : 'Verify'}
                      </Button>
                      <Button
                        variant={user.isBlocked ? "default" : "destructive"}
                        size="sm"
                        onClick={() => handleToggleBlock(user.id, user.isBlocked)}
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        {user.isBlocked ? 'Unblock' : 'Block'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
