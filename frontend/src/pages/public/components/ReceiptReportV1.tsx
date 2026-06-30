import { useState, useEffect } from 'react';
import { Activity, ArrowDownCircle, Server, ZoomIn } from 'lucide-react';
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

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
  r2ImageUrl?: string;
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

export interface Snapshot {
  id: string;
  period: string;
  groupName: string | null;
  startDate: string;
  endDate: string;
  reportData: ConfigReport[];
  createdAt: string;
  pdfUrl?: string | null;
}

interface ReceiptReportProps {
  snapshot: Snapshot;
}

const TILE_COLORS = [
  { bg: 'bg-[#f5f5f7]', text: 'text-[#1d1d1f]', muted: 'text-[#86868b]', cardBg: 'bg-[#ffffff]', accent: 'text-[#0066cc]' },
  { bg: 'bg-[#272729]', text: 'text-[#ffffff]', muted: 'text-[#cccccc]', cardBg: 'bg-[#2a2a2c]', accent: 'text-[#2997ff]' },
  { bg: 'bg-[#ffffff]', text: 'text-[#1d1d1f]', muted: 'text-[#86868b]', cardBg: 'bg-[#f5f5f7]', accent: 'text-[#0066cc]' },
];

export default function ReceiptReportV1({ snapshot }: ReceiptReportProps) {
  const [openLightbox, setOpenLightbox] = useState<{ configId: number; index: number } | null>(null);
  const [isPrintMode, setIsPrintMode] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('print') === 'true') {
      setIsPrintMode(true);
    }
  }, []);

  const handleDownload = () => {
    if (snapshot.pdfUrl) window.open(snapshot.pdfUrl, '_blank');
  };

  const periodLabel = snapshot.period === 'DAILY' ? 'Harian' : snapshot.period === 'WEEKLY' ? 'Mingguan' : 'Bulanan';
  const periodText = snapshot.period === 'DAILY' 
    ? `${new Date(snapshot.startDate).toLocaleDateString('id-ID')} 00:00 WIB — 23:59 WIB`
    : `${new Date(snapshot.startDate).toLocaleDateString('id-ID')} — ${new Date(snapshot.endDate).toLocaleDateString('id-ID')}`;

  const totalConfigs = snapshot.reportData.length;
  const totalDown = snapshot.reportData.reduce((acc, c) => acc + c.downCount, 0);
  const totalLowTraffic = snapshot.reportData.reduce((acc, c) => acc + c.lowTrafficCount, 0);

  return (
    <div className={`min-h-screen ${isPrintMode ? 'bg-white' : 'bg-[#f5f5f7]'} text-[#1d1d1f] font-[system-ui,-apple-system,sans-serif] selection:bg-[#0066cc]/30`}>
      
      {!isPrintMode && (
        <header className="w-full bg-[#000000] text-[#ffffff] h-[44px] flex items-center px-4 sm:px-6">
          <div className="max-w-[1440px] mx-auto w-full flex items-center justify-between text-[12px] tracking-[-0.12px]">
            <span className="font-semibold">NOC Report</span>
            <span className="opacity-80">{periodText}</span>
          </div>
        </header>
      )}

      <main className="w-full">
        <section className="bg-[#ffffff] pt-[80px] pb-[64px] px-4 sm:px-6 flex flex-col items-center text-center">
          <p className="text-[#0066cc] text-[17px] sm:text-[21px] font-semibold tracking-[0.231px] mb-2 sm:mb-4">
            Laporan {periodLabel}
            {snapshot.period === 'DAILY' && (
              <span className="block text-[15px] sm:text-[17px] font-medium text-[#86868b] mt-1">
                {new Date(snapshot.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} (00:00 WIB — 23:59 WIB)
              </span>
            )}
          </p>
          <h1 className="text-[36px] sm:text-[40px] md:text-[56px] font-semibold tracking-[-0.28px] leading-[1.07] text-[#1d1d1f] mb-4 sm:mb-6">
            Bandwidth <br className="sm:hidden" /> Report.
          </h1>
          <p className="text-[28px] font-normal text-[#86868b] tracking-[0.196px] leading-[1.14] max-w-2xl mx-auto mb-6">
            Group: <span className="text-[#1d1d1f]">{snapshot.groupName || 'Semua Grup'}</span>
          </p>
          
          {snapshot.pdfUrl && !isPrintMode && (
            <button 
              onClick={handleDownload}
              className="inline-flex items-center gap-2 bg-[#0066cc] text-white px-6 py-3 rounded-full font-medium hover:bg-[#0055aa] transition-colors"
            >
              <ArrowDownCircle className="w-5 h-5" />
              Download PDF Report
            </button>
          )}
        </section>

        <section className="bg-[#f5f5f7] py-[48px] sm:py-[80px] px-4 sm:px-6">
          <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-[#ffffff] rounded-[18px] p-[20px] sm:p-[24px] flex flex-col items-center text-center shadow-[0_5px_30px_rgba(0,0,0,0.04)]">
              <Server className="h-8 w-8 text-[#1d1d1f] mb-2 sm:mb-4" />
              <h3 className="text-[32px] sm:text-[40px] font-semibold tracking-[-0px] text-[#1d1d1f] mb-1">{totalConfigs}</h3>
              <p className="text-[15px] sm:text-[17px] font-semibold tracking-[-0.374px] text-[#1d1d1f]">Monitored Sensors</p>
            </div>
            <div className="bg-[#ffffff] rounded-[18px] p-[20px] sm:p-[24px] flex flex-col items-center text-center shadow-[0_5px_30px_rgba(0,0,0,0.04)]">
              <ArrowDownCircle className="h-8 w-8 text-[#ff3b30] mb-2 sm:mb-4" />
              <h3 className="text-[32px] sm:text-[40px] font-semibold tracking-[-0px] text-[#ff3b30] mb-1">{totalDown}</h3>
              <p className="text-[15px] sm:text-[17px] font-semibold tracking-[-0.374px] text-[#1d1d1f]">Total Down</p>
            </div>
            <div className="bg-[#ffffff] rounded-[18px] p-[20px] sm:p-[24px] flex flex-col items-center text-center shadow-[0_5px_30px_rgba(0,0,0,0.04)]">
              <Activity className="h-8 w-8 text-[#ff9500] mb-2 sm:mb-4" />
              <h3 className="text-[32px] sm:text-[40px] font-semibold tracking-[-0px] text-[#ff9500] mb-1">{totalLowTraffic}</h3>
              <p className="text-[15px] sm:text-[17px] font-semibold tracking-[-0.374px] text-[#1d1d1f]">Total Low Traffic</p>
            </div>
          </div>
        </section>

        <section className="w-full">
          {snapshot.reportData.length === 0 ? (
            <div className="text-center py-[80px] bg-[#ffffff]">
              <p className="text-[28px] text-[#86868b] tracking-[0.196px]">Tidak ada insiden tercatat.</p>
            </div>
          ) : (
            snapshot.reportData.map((config, index) => {
              const theme = TILE_COLORS[index % TILE_COLORS.length];
              
              return (
                <div key={config.configId} className={`w-full ${theme.bg} ${theme.text} py-[48px] sm:py-[80px] flex flex-col items-center`}>
                  <div className="text-center max-w-[980px] px-4 mx-auto mb-10 sm:mb-16">
                    <span className={`text-[12px] sm:text-[14px] font-semibold tracking-[-0.224px] ${theme.muted} mb-2 block`}>{config.groupName}</span>
                    <h2 className={`text-[32px] sm:text-[40px] md:text-[56px] font-semibold tracking-[-0.28px] leading-[1.1] mb-4 sm:mb-6`}>
                      {config.title}
                    </h2>
                    <div className="flex items-center justify-center gap-4 text-[15px] sm:text-[17px] tracking-[-0.374px]">
                      {config.downCount > 0 && <span className="text-[#ff3b30] font-semibold">Down: {config.downCount}</span>}
                      {config.lowTrafficCount > 0 && <span className="text-[#ff9500] font-semibold">Low Traffic: {config.lowTrafficCount}</span>}
                    </div>
                  </div>

                  <div className="w-full max-w-[1440px] px-4 sm:px-6 space-y-6 sm:space-y-8">
                    {config.incidents.map((incident, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        
                        <div className={`w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl ${theme.cardBg} rounded-[18px] p-5 sm:p-8 mb-0 shadow-[0_5px_30px_rgba(0,0,0,0.04)] overflow-hidden`}>
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 border-b border-[#e0e0e0] dark:border-[#333333] pb-4 gap-3 sm:gap-0">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                              <span className={`px-3 py-1.5 sm:px-4 sm:py-2 text-[12px] sm:text-[14px] font-semibold rounded-[9999px] ${incident.status === 'DOWN' ? 'bg-[#ff3b30] text-white' : 'bg-[#ff9500] text-white'}`}>
                                {incident.status === 'LOW_TRAFFIC' ? 'Low Traffic' : incident.status}
                              </span>
                              <span className={`text-[18px] sm:text-[21px] font-semibold tracking-[0.231px] ${theme.text}`}>{incident.formattedTime}</span>
                            </div>
                            {incident.recoveryTime && (
                              <span className="text-[15px] sm:text-[17px] font-semibold text-[#34c759] tracking-[-0.374px]">
                                Pulih: {new Date(incident.recoveryTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')} WIB
                              </span>
                            )}
                          </div>

                          {(incident.inboundBefore != null || incident.inboundDuring != null) && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
                              <div className="flex flex-col sm:block items-start">
                                <p className={`text-[12px] sm:text-[14px] font-semibold tracking-[-0.224px] ${theme.muted} mb-1 sm:mb-2`}>Traffic In {incident.status === 'LOW_TRAFFIC' && '(Rata-rata)'}</p>
                                <p className={`text-[26px] sm:text-[34px] font-semibold tracking-[-0.374px] ${theme.text} flex flex-wrap items-baseline gap-1 sm:gap-0`}>
                                  <span className="text-[#34c759]">{incident.inboundBefore ? (incident.inboundBefore / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className={`text-[20px] sm:text-[24px] ${theme.muted} mx-1 sm:mx-2 font-normal`}>→</span>
                                  <span className={incident.status === 'DOWN' ? 'text-[#ff3b30]' : 'text-[#ff9500]'}>{incident.inboundDuring ? (incident.inboundDuring / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className={`text-[14px] sm:text-[17px] ${theme.muted} ml-1 font-normal`}>Mbps</span>
                                </p>
                              </div>
                              <div className="flex flex-col sm:block items-start">
                                <p className={`text-[12px] sm:text-[14px] font-semibold tracking-[-0.224px] ${theme.muted} mb-1 sm:mb-2`}>Traffic Out {incident.status === 'LOW_TRAFFIC' && '(Rata-rata)'}</p>
                                <p className={`text-[26px] sm:text-[34px] font-semibold tracking-[-0.374px] ${theme.text} flex flex-wrap items-baseline gap-1 sm:gap-0`}>
                                  <span className="text-[#34c759]">{incident.outboundBefore ? (incident.outboundBefore / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className={`text-[20px] sm:text-[24px] ${theme.muted} mx-1 sm:mx-2 font-normal`}>→</span>
                                  <span className={incident.status === 'DOWN' ? 'text-[#ff3b30]' : 'text-[#ff9500]'}>{incident.outboundDuring ? (incident.outboundDuring / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className={`text-[14px] sm:text-[17px] ${theme.muted} ml-1 font-normal`}>Mbps</span>
                                </p>
                              </div>
                              <div className="flex flex-col sm:block items-start">
                                <p className={`text-[12px] sm:text-[14px] font-semibold tracking-[-0.224px] ${theme.muted} mb-1 sm:mb-2`}>Total Traffic {incident.status === 'LOW_TRAFFIC' && '(Rata-rata)'}</p>
                                <p className={`text-[26px] sm:text-[34px] font-semibold tracking-[-0.374px] ${theme.text} flex flex-wrap items-baseline gap-1 sm:gap-0`}>
                                  <span className="text-[#34c759]">{((incident.inboundBefore || 0) + (incident.outboundBefore || 0)) > 0 ? (((incident.inboundBefore || 0) + (incident.outboundBefore || 0)) / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className={`text-[20px] sm:text-[24px] ${theme.muted} mx-1 sm:mx-2 font-normal`}>→</span>
                                  <span className={incident.status === 'DOWN' ? 'text-[#ff3b30]' : 'text-[#ff9500]'}>{((incident.inboundDuring || 0) + (incident.outboundDuring || 0)) > 0 ? (((incident.inboundDuring || 0) + (incident.outboundDuring || 0)) / 1000 / 1000).toFixed(2) : '0'}</span>
                                  <span className={`text-[14px] sm:text-[17px] ${theme.muted} ml-1 font-normal`}>Mbps</span>
                                </p>
                              </div>
                            </div>
                          )}

                          <div 
                            className="mt-6 sm:mt-8 -mx-5 -mb-5 sm:-mx-8 sm:-mb-8 cursor-pointer relative bg-[#f5f5f7] dark:bg-[#1c1c1e] min-h-[150px] sm:min-h-[250px] flex items-center justify-center group border-t border-[#e0e0e0] dark:border-[#333333]"
                            onClick={() => !isPrintMode && setOpenLightbox({ configId: config.configId, index: idx })}
                          >
                            <div className="absolute inset-0 flex items-center justify-center">
                               <Activity className="h-8 w-8 text-[#0066cc] animate-pulse" />
                            </div>
                            <img 
                              src={incident.r2ImageUrl || `/api/public/receipt-reports/chart/${snapshot.id}/${config.sensorId}?sdate=${incident.sdate}&edate=${incident.edate}`} 
                              alt={`Chart for ${config.title}`} 
                              className="w-[92%] sm:w-[90%] h-auto block relative z-10 my-4 sm:my-6 bg-[#ffffff] rounded-md shadow-sm transition-transform duration-500 group-hover:scale-105"
                              loading="lazy"
                              onLoad={(e) => {
                                const target = e.target as HTMLImageElement;
                                const parent = target.previousElementSibling;
                                if (parent) parent.remove();
                              }}
                            />
                            <div className="absolute top-4 right-4 z-20 bg-black/50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <ZoomIn className="w-5 h-5" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Lightbox Gallery for this specific Sensor Config */}
                  <Lightbox
                    open={openLightbox?.configId === config.configId}
                    close={() => setOpenLightbox(null)}
                    index={openLightbox?.configId === config.configId ? openLightbox.index : 0}
                    slides={config.incidents.map((inc) => ({
                      src: inc.r2ImageUrl || `/api/public/receipt-reports/chart/${snapshot.id}/${config.sensorId}?sdate=${inc.sdate}&edate=${inc.edate}`,
                      alt: `Chart for ${config.title} at ${inc.formattedTime}`,
                    }))}
                    plugins={[Zoom]}
                    carousel={{ finite: false }}
                    styles={{ container: { backgroundColor: "rgba(0, 0, 0, .9)" } }}
                  />
                </div>
              );
            })
          )}
        </section>
      </main>

      <footer className="bg-[#f5f5f7] py-[32px] sm:py-[64px] border-t border-[#e0e0e0]">
        <div className="max-w-[1440px] mx-auto px-6 text-center">
          <p className="text-[12px] font-normal text-[#7a7a7a] tracking-[-0.12px]">
            Generated by PRTG R1NET Reporting Engine. v0.0.1
          </p>
        </div>
      </footer>
    </div>
  );
}
