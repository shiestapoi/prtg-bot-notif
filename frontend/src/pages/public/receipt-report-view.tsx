import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicReportApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, ArrowDownCircle, Calendar, Clock, LayoutDashboard, Server } from 'lucide-react';

interface Incident {
  status: string;
  time: string;
  formattedTime: string;
}

interface ConfigReport {
  configId: number;
  title: string;
  groupName: string;
  downCount: number;
  lowTrafficCount: number;
  incidents: Incident[];
}

interface Snapshot {
  id: string;
  period: string;
  groupName: string | null;
  startDate: string;
  endDate: string;
  reportData: ConfigReport[];
  createdAt: string;
}

export default function PublicReceiptReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    publicReportApi.fetchReportSnapshot(id)
      .then((data) => {
        setSnapshot(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Report not found or link expired.');
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <Activity className="h-10 w-10 text-primary animate-pulse" />
        <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">Loading Report...</h2>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 shadow-xl rounded-xl p-8 text-center border border-slate-200 dark:border-slate-800">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Laporan Tidak Ditemukan</h2>
          <p className="text-slate-500 dark:text-slate-400">{error || 'ID Laporan tidak valid.'}</p>
        </div>
      </div>
    );
  }

  const periodLabel = snapshot.period === 'DAILY' ? 'Harian' : snapshot.period === 'WEEKLY' ? 'Mingguan' : 'Bulanan';
  
  // Aggregate Stats
  const totalConfigs = snapshot.reportData.length;
  const totalDown = snapshot.reportData.reduce((acc, c) => acc + c.downCount, 0);
  const totalLowTraffic = snapshot.reportData.reduce((acc, c) => acc + c.lowTrafficCount, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-slate-100 font-sans selection:bg-primary/30">
      
      {/* Header Section */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <LayoutDashboard className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">NOC Executive Report</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">Network Operations Center</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold">{periodLabel} Bandwidth Report</div>
            <div className="text-xs text-slate-500 flex items-center gap-1 justify-end mt-0.5">
              <Calendar className="h-3 w-3" />
              {new Date(snapshot.startDate).toLocaleDateString('id-ID')} - {new Date(snapshot.endDate).toLocaleDateString('id-ID')}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Title & Scope */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Ringkasan Laporan {periodLabel}</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Filter Grup: <span className="font-semibold text-slate-700 dark:text-slate-300">{snapshot.groupName || 'Semua Grup'}</span>
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-800 text-sm font-medium shadow-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Dibuat: {new Date(snapshot.createdAt).toLocaleString('id-ID')}
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription className="font-medium text-slate-500">Node Bermasalah</CardDescription>
              <CardTitle className="text-4xl font-bold">{totalConfigs}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <Server className="h-3.5 w-3.5" /> Sensor yang terdeteksi
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/10 rounded-bl-full -mr-4 -mt-4 blur-xl" />
            <CardHeader className="pb-2">
              <CardDescription className="font-medium text-slate-500">Total Down</CardDescription>
              <CardTitle className="text-4xl font-bold text-red-600 dark:text-red-500">{totalDown}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-red-600/70 dark:text-red-400/70 flex items-center gap-1 mt-1 font-medium">
                <ArrowDownCircle className="h-3.5 w-3.5" /> Insiden Terputus
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-amber-500/10 rounded-bl-full -mr-4 -mt-4 blur-xl" />
            <CardHeader className="pb-2">
              <CardDescription className="font-medium text-slate-500">Total Low Traffic</CardDescription>
              <CardTitle className="text-4xl font-bold text-amber-600 dark:text-amber-500">{totalLowTraffic}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-amber-600/70 dark:text-amber-400/70 flex items-center gap-1 mt-1 font-medium">
                <Activity className="h-3.5 w-3.5" /> Insiden Trafik Rendah
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Report List */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold border-b border-slate-200 dark:border-slate-800 pb-2">Rincian Insiden per Node</h3>
          
          {snapshot.reportData.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 border-dashed">
              <p className="text-slate-500">Tidak ada insiden tercatat pada periode ini.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {snapshot.reportData.map((config) => (
                <Card key={config.configId} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                  <div className="flex flex-col md:flex-row">
                    
                    {/* Left Column: Config Info */}
                    <div className="md:w-1/3 bg-slate-50 dark:bg-slate-900/50 p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
                      <div className="mb-4">
                        <Badge variant="outline" className="mb-2 bg-white dark:bg-slate-950 font-semibold">{config.groupName}</Badge>
                        <h4 className="text-lg font-bold leading-tight">{config.title}</h4>
                      </div>
                      
                      <div className="flex gap-4">
                        {config.downCount > 0 && (
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Down</span>
                            <span className="text-2xl font-bold text-red-500">{config.downCount}x</span>
                          </div>
                        )}
                        {config.lowTrafficCount > 0 && (
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Low Traffic</span>
                            <span className="text-2xl font-bold text-amber-500">{config.lowTrafficCount}x</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Incident Timeline */}
                    <div className="md:w-2/3 p-6">
                      <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-200 mb-4 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-400" /> Waktu Terjadinya Insiden
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {config.incidents.map((incident, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 rounded-md bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/50">
                            <Badge 
                              variant={incident.status === 'DOWN' ? 'destructive' : 'default'} 
                              className={incident.status === 'LOW_TRAFFIC' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
                            >
                              {incident.status === 'LOW_TRAFFIC' ? 'LOW' : incident.status}
                            </Badge>
                            <span className="text-sm font-medium tabular-nums">{incident.formattedTime}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-slate-500">
          Generated automatically by Harutaka NOC Reporting Engine. <br className="sm:hidden" />
          <span className="hidden sm:inline"> | </span> 
          ID: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{snapshot.id}</code>
        </div>
      </footer>

    </div>
  );
}
