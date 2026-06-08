import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicReportApi } from '@/lib/api';
import { Activity, AlertTriangle, ArrowDownCircle, Clock, LayoutDashboard, Server } from 'lucide-react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';

interface Incident {
  status: string;
  time: string;
  recoveryTime: string | null;
  formattedTime: string;
  inboundBefore: number | null;
  inboundDuring: number | null;
  outboundBefore: number | null;
  outboundDuring: number | null;
  threshold?: number | null;
  sdate: string;
  edate: string;
}

interface ConfigReport {
  configId: number;
  sensorId: number;
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
      <div className="min-h-screen bg-[#fafafc] dark:bg-[#000000] flex flex-col items-center justify-center space-y-4">
        <Activity className="h-10 w-10 text-[#0066cc] animate-pulse" />
        <h2 className="text-xl font-semibold text-[#1d1d1f] dark:text-white tracking-tight">Loading Report...</h2>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen bg-[#fafafc] dark:bg-[#000000] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#1d1d1f] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[24px] p-10 text-center">
          <AlertTriangle className="h-16 w-16 text-[#ff3b30] mx-auto mb-6" />
          <h2 className="text-2xl font-semibold text-[#1d1d1f] dark:text-white mb-2 tracking-tight">Laporan Tidak Ditemukan</h2>
          <p className="text-[#86868b] font-medium">{error || 'ID Laporan tidak valid.'}</p>
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
    <div className="min-h-screen bg-[#fafafc] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] font-sans antialiased selection:bg-[#0066cc]/30">
      
      {/* Global Nav-like Header */}
      <header className="w-full bg-[#1d1d1f] text-[#f5f5f7]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[44px] flex items-center justify-between text-xs font-medium tracking-tight">
          <div className="flex items-center gap-2 opacity-90">
            <LayoutDashboard className="h-4 w-4" />
            <span>NOC Report</span>
          </div>
          <div className="opacity-80">
            {new Date(snapshot.startDate).toLocaleDateString('id-ID')} — {new Date(snapshot.endDate).toLocaleDateString('id-ID')}
          </div>
        </div>
      </header>

      <main className="w-full">
        {/* Hero Section */}
        <section className="bg-[#ffffff] dark:bg-[#000000] pt-24 pb-16 px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
          <p className="text-[#0066cc] text-sm font-semibold tracking-wide uppercase mb-4">Laporan {periodLabel}</p>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-semibold tracking-[-0.04em] leading-[1.05] text-[#1d1d1f] dark:text-[#f5f5f7] mb-6">
            Laporan <br className="sm:hidden" /> Bandwidth.
          </h1>
          <p className="text-xl sm:text-2xl text-[#86868b] font-medium max-w-2xl mx-auto tracking-tight">
            Grup Terpilih: <span className="text-[#1d1d1f] dark:text-[#f5f5f7]">{snapshot.groupName || 'Semua Grup'}</span>
          </p>
          <div className="mt-8 text-xs text-[#86868b] flex items-center justify-center gap-1.5 font-medium">
            <Clock className="h-3.5 w-3.5" /> Dibuat pada {new Date(snapshot.createdAt).toLocaleString('id-ID')}
          </div>
        </section>

        {/* Stats Section (Edge to Edge Tile alternating) */}
        <section className="bg-[#fafafc] dark:bg-[#1d1d1f] py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 text-center">
              <div className="flex flex-col items-center">
                <div className="mb-4"><Server className="h-10 w-10 text-[#86868b]" /></div>
                <h3 className="text-6xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">{totalConfigs}</h3>
                <p className="text-lg font-medium text-[#86868b]">Sensor Termonitor</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="mb-4"><ArrowDownCircle className="h-10 w-10 text-[#ff3b30]" /></div>
                <h3 className="text-6xl font-semibold tracking-tight text-[#ff3b30] mb-2">{totalDown}</h3>
                <p className="text-lg font-medium text-[#86868b]">Total Insiden Down</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="mb-4"><Activity className="h-10 w-10 text-[#ff9500]" /></div>
                <h3 className="text-6xl font-semibold tracking-tight text-[#ff9500] mb-2">{totalLowTraffic}</h3>
                <p className="text-lg font-medium text-[#86868b]">Total Low Traffic</p>
              </div>
            </div>
          </div>
        </section>

        {/* Incidents Report List */}
        <section className="bg-[#ffffff] dark:bg-[#000000] py-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
            
            {snapshot.reportData.length === 0 ? (
              <div className="text-center">
                <p className="text-xl text-[#86868b] font-medium tracking-tight">Tidak ada insiden tercatat pada periode ini.</p>
              </div>
            ) : (
              snapshot.reportData.map((config, index) => (
                <div key={config.configId} className="space-y-12">
                  <div className="text-center max-w-3xl mx-auto">
                    <span className="text-xs font-semibold uppercase tracking-widest text-[#86868b] mb-2 block">{config.groupName}</span>
                    <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] mb-4">
                      {config.title}
                    </h2>
                    <div className="flex items-center justify-center gap-6 text-sm font-medium">
                      {config.downCount > 0 && <span className="text-[#ff3b30]">Down: {config.downCount}x</span>}
                      {config.lowTrafficCount > 0 && <span className="text-[#ff9500]">Low Traffic: {config.lowTrafficCount}x</span>}
                    </div>
                  </div>

                  <div className="space-y-20">
                    {config.incidents.map((incident, idx) => (
                      <div key={idx} className="flex flex-col items-center relative">
                        
                        {/* Traffic Info Tile */}
                        <div className="w-full max-w-2xl bg-[#fafafc] dark:bg-[#1d1d1f] rounded-[24px] p-8 sm:p-10 mb-8 sm:mb-12">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full ${incident.status === 'DOWN' ? 'bg-[#ff3b30]/10 text-[#ff3b30]' : 'bg-[#ff9500]/10 text-[#ff9500]'}`}>
                                {incident.status === 'LOW_TRAFFIC' ? 'Low Traffic' : incident.status}
                              </span>
                              <span className="text-lg font-semibold tracking-tight">{incident.formattedTime}</span>
                            </div>
                            {incident.recoveryTime && (
                              <span className="text-sm font-medium text-[#34c759] mt-3 sm:mt-0">
                                Pulih: {new Date(incident.recoveryTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')} WIB
                              </span>
                            )}
                          </div>

                          {(incident.inboundBefore != null || incident.inboundDuring != null) && (
                            <div className="grid grid-cols-2 gap-8 text-[#1d1d1f] dark:text-[#f5f5f7]">
                              <div>
                                <p className="text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Download</p>
                                <p className="text-3xl font-semibold tracking-tight">
                                  <span className="text-[#34c759]">{incident.inboundBefore ? (incident.inboundBefore / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className="text-lg text-[#86868b] mx-2 font-normal">→</span>
                                  <span className={incident.status === 'DOWN' ? 'text-[#ff3b30]' : 'text-[#ff9500]'}>{incident.inboundDuring ? (incident.inboundDuring / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className="text-sm text-[#86868b] ml-1 font-normal">Mbps</span>
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Upload</p>
                                <p className="text-3xl font-semibold tracking-tight">
                                  <span className="text-[#34c759]">{incident.outboundBefore ? (incident.outboundBefore / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className="text-lg text-[#86868b] mx-2 font-normal">→</span>
                                  <span className={incident.status === 'DOWN' ? 'text-[#ff3b30]' : 'text-[#ff9500]'}>{incident.outboundDuring ? (incident.outboundDuring / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className="text-sm text-[#86868b] ml-1 font-normal">Mbps</span>
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Product Imagery (Chart) resting on surface */}
                        <div className="w-full relative px-2 sm:px-4 -mt-4 sm:-mt-8 z-10">
                           <div className="max-w-4xl mx-auto rounded-[20px] overflow-x-auto overflow-y-hidden shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)] bg-white border border-[#e5e5ea] dark:border-[#333336]">
                             <div className="min-w-[600px] sm:min-w-full p-2 sm:p-4 flex items-center justify-center bg-white">
                               <Zoom>
                                 <img 
                                   src={`/api/public/receipt-reports/chart/${snapshot.id}/${config.sensorId}?sdate=${incident.sdate}&edate=${incident.edate}`} 
                                   alt={`PRTG Chart for ${config.title}`} 
                                   className="max-w-full h-auto object-contain bg-white transition-opacity duration-300"
                                   loading="lazy"
                                 />
                               </Zoom>
                             </div>
                           </div>
                        </div>

                      </div>
                    ))}
                  </div>

                  {index < snapshot.reportData.length - 1 && (
                    <div className="w-full h-px bg-[#e5e5ea] dark:bg-[#333336] max-w-xs mx-auto my-32" />
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="bg-[#fafafc] dark:bg-[#1d1d1f] py-16 border-t border-[#e5e5ea] dark:border-[#333336]">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs font-medium text-[#86868b]">
            Generated automatically by Harutaka NOC Reporting Engine. <br className="sm:hidden" />
            v0.0.1 (Alpha)
          </p>
        </div>
      </footer>
    </div>
  );
}
