import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, RefreshCw, Calendar, Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

interface SnapshotHistory {
  id: string;
  period: string;
  groupName: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export default function ReceiptHistoryPage() {
  const [history, setHistory] = useState<SnapshotHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.get('/api/report/receipt/history', { params: {} as any });
      setHistory(res.data);
    } catch (_error) {
      toast.error('Gagal memuat history laporan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory();
  }, []);

  const handleManualGenerate = async () => {
    try {
      setGenerating(true);
      await api.post('/api/receipt-reports/manual-generate', {
        period: 'DAILY'
      });
      toast.success('Laporan berhasil digenerate');
      fetchHistory();
    } catch (error) {
      toast.error('Gagal men-generate laporan');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Riwayat Laporan BW</h2>
          <p className="text-muted-foreground mt-1">
            Daftar laporan bandwidth yang telah dikirim ke WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleManualGenerate} disabled={generating}>
            <Plus className="h-4 w-4 mr-2" />
            {generating ? 'Memproses...' : 'Generate Harian'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History Snapshot</CardTitle>
          <CardDescription>Semua URL web-view laporan yang pernah dibuat.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Memuat data...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Belum ada riwayat laporan.</div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Periode</th>
                    <th className="px-4 py-3 font-medium">Grup</th>
                    <th className="px-4 py-3 font-medium">Waktu Data</th>
                    <th className="px-4 py-3 font-medium">Dibuat Pada</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((item) => (
                    <tr key={item.id} className="bg-card hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant="outline">{item.period}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">{item.groupName || 'Semua Grup'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(item.startDate).toLocaleDateString('id-ID')} - {new Date(item.endDate).toLocaleDateString('id-ID')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a 
                          href={`/report/${item.id}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3"
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Buka Web
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
