import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { prtgSettingApi } from '@/lib/api';
import type { PrtgSetting } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Save } from 'lucide-react';

export default function PrtgSettingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [loginUrl, setLoginUrl] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [hasLoginPassword, setHasLoginPassword] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('');
  const [alertMessageTemplate, setAlertMessageTemplate] = useState('');
  const [recoveryMessageTemplate, setRecoveryMessageTemplate] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const data: PrtgSetting = await prtgSettingApi.get();
      setLoginUrl(data.loginUrl || '');
      setLoginUsername(data.loginUsername || '');
      setHasLoginPassword(data.hasLoginPassword);
      setMessageTemplate(data.messageTemplate || '');
      setAlertMessageTemplate(data.alertMessageTemplate || '');
      setRecoveryMessageTemplate(data.recoveryMessageTemplate || '');
      setLoginPassword('');
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load settings',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: Record<string, string> = {
        loginUrl,
        loginUsername,
        messageTemplate,
        alertMessageTemplate,
        recoveryMessageTemplate,
      };

      // Only include password if user typed a new one
      if (loginPassword) {
        payload.loginPassword = loginPassword;
      }

      await prtgSettingApi.update(payload);
      toast.success('Pengaturan berhasil disimpan');
      setHasLoginPassword(true);
      setLoginPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan';
      toast.error(message);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">PRTG Setting</h1>
          <p className="mt-1 text-muted-foreground">
            Manage PRTG login configuration and message templates.
          </p>
        </div>
        <p className="text-muted-foreground">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">PRTG Setting</h1>
        <p className="mt-1 text-muted-foreground">
          Manage PRTG login configuration and message templates.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Login Configuration */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-medium">
            Login Configuration
          </legend>

          <div className="space-y-2">
            <Label htmlFor="login-url">Login URL</Label>
            <Input
              id="login-url"
              type="url"
              placeholder="https://prtg.example.com/api/..."
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-username">Username</Label>
            <Input
              id="login-username"
              placeholder="PRTG username"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              placeholder={
                hasLoginPassword
                  ? '••••••••  (leave blank to keep current)'
                  : 'Enter password'
              }
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            {hasLoginPassword && (
              <p className="text-xs text-muted-foreground">
                A password is already set. Leave blank to keep the current
                password.
              </p>
            )}
          </div>
        </fieldset>

        {/* Report Message Templates */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-medium">
            Report Message Templates
          </legend>

          <div className="space-y-2">
            <Label htmlFor="message-template">Message Template</Label>
            <Textarea
              id="message-template"
              placeholder="Default message template…"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Placeholders: {'{title}'}, {'{groupname}'}, {'{time}'}, {'{bitrate}'}
            </p>
          </div>
        </fieldset>

        {/* Alert Message Templates */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-medium">
            Alert Message Templates
          </legend>

          <div className="space-y-2">
            <Label htmlFor="alert-message-template">
              Alert Message Template
            </Label>
            <Textarea
              id="alert-message-template"
              placeholder="Alert message template…"
              value={alertMessageTemplate}
              onChange={(e) => setAlertMessageTemplate(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Placeholders: {'{title}'}, {'{status}'}, {'{bitrate}'}, {'{trafficIn}'}, {'{trafficOut}'}, {'{time}'}, {'{reason}'}, {'{groupName}'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recovery-message-template">
              Recovery Message Template
            </Label>
            <Textarea
              id="recovery-message-template"
              placeholder="Recovery message template…"
              value={recoveryMessageTemplate}
              onChange={(e) => setRecoveryMessageTemplate(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Placeholders: {'{title}'}, {'{status}'}, {'{bitrate}'}, {'{trafficIn}'}, {'{trafficOut}'}, {'{time}'}, {'{groupName}'}
            </p>
          </div>
        </fieldset>

        <Button type="submit" disabled={saving}>
          <Save className="size-4" data-icon="inline-start" />
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </form>
    </div>
  );
}
