import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogOutIcon, RefreshCwIcon, PhoneIcon, UserIcon } from 'lucide-react';

interface WhatsappStatus {
  sessionName: string;
  status: string;
  qr: string | null;
  qrDataUrl: string | null;
  isNewLogin: boolean;
  isConnected: boolean;
  me: { id?: string; name?: string } | null;
}

export default function WhatsappPage() {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Initial status fetch
    // Will be called below

    // Connect to SSE stream for real-time updates
    const token = localStorage.getItem('prtg_token');
    const url = token ? `/api/whatsapp/stream?token=${token}` : '/api/whatsapp/stream';
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sessionName) {
          setStatus(data);
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // Will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const res = await api.get('/api/whatsapp/status');
      setStatus(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to logout from WhatsApp? You will need to re-pair the device.')) {
      return;
    }
    setLoggingOut(true);
    try {
      await api.post('/api/whatsapp/logout');
      // Status will update via SSE
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to logout');
    } finally {
      setLoggingOut(false);
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'open': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'qr_ready': return 'bg-blue-500';
      case 'logged_out': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'open': return 'Connected';
      case 'connecting': return 'Connecting';
      case 'qr_ready': return 'Waiting for QR Scan';
      case 'logged_out': return 'Logged Out';
      case 'idle': return 'Idle';
      case 'error': return 'Error';
      default: return s;
    }
  };

  const formatPhoneNumber = (id?: string) => {
    if (!id) return null;
    const number = id.split('@')[0] || id;
    // Format: +62 812 3456 7890
    if (number.length > 6) {
      return `+${number}`;
    }
    return number;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">WhatsApp</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">WhatsApp</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
        <Button onClick={fetchStatus}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Manage WhatsApp connection and pairing.
        </p>
      </div>

      {/* Connection Status */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${getStatusColor(status?.status ?? 'idle')}`} />
            <span className="font-medium">{getStatusLabel(status?.status ?? 'idle')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchStatus}>
              <RefreshCwIcon className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            {status?.status === 'open' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                <LogOutIcon className="h-4 w-4 mr-1" />
                {loggingOut ? 'Logging out...' : 'Logout'}
              </Button>
            )}
          </div>
        </div>

        {/* Device Info */}
        {status?.status === 'open' && status.me && (
          <div className="rounded-md bg-muted/50 p-3 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Paired Device</p>
            <div className="flex flex-col gap-1.5">
              {status.me.name && (
                <div className="flex items-center gap-2 text-sm">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{status.me.name}</span>
                </div>
              )}
              {status.me.id && (
                <div className="flex items-center gap-2 text-sm">
                  <PhoneIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{formatPhoneNumber(status.me.id)}</span>
                  <Badge variant="secondary" className="text-xs">
                    {status.sessionName}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Disconnected state */}
        {(status?.status === 'logged_out' || status?.status === 'idle') && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">
              WhatsApp is disconnected. A QR code will appear automatically for re-pairing.
            </p>
          </div>
        )}
      </div>

      {/* QR Code for Pairing */}
      {status?.qrDataUrl && (
        <div className="rounded-lg border p-6 flex flex-col items-center gap-4">
          <h2 className="text-lg font-semibold">Scan QR Code to Pair</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → Scan this QR code
          </p>
          <img
            src={status.qrDataUrl}
            alt="WhatsApp QR Code"
            className="w-64 h-64 rounded-lg border"
          />
        </div>
      )}

      {status?.status === 'connecting' && !status.qrDataUrl && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">Connecting to WhatsApp... QR code will appear shortly.</p>
        </div>
      )}
    </div>
  );
}
