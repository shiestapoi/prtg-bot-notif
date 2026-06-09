import { useState } from 'react';
import { Activity, ArrowDownCircle, Server, ZoomIn, Clock, ShieldAlert } from 'lucide-react';
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import type { Snapshot } from './ReceiptReportV1';

interface ReceiptReportProps {
  snapshot: Snapshot;
}

export default function ReceiptReportV2({ snapshot }: ReceiptReportProps) {
  const [openLightbox, setOpenLightbox] = useState<{ configId: number; index: number } | null>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);

  const periodLabel = snapshot.period === 'DAILY' ? 'Harian' : snapshot.period === 'WEEKLY' ? 'Mingguan' : 'Bulanan';
  const totalConfigs = snapshot.reportData.length;
  const totalDown = snapshot.reportData.reduce((acc, c) => acc + c.downCount, 0);
  const totalLowTraffic = snapshot.reportData.reduce((acc, c) => acc + c.lowTrafficCount, 0);
  const uniqueGroups = Array.from(new Set(snapshot.reportData.map((c) => c.groupName))).filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-blue-500/30">
      
      {/* Corporate Header */}
      <header className="w-full bg-slate-950 border-b border-slate-800 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded overflow-hidden flex items-center justify-center" style={{ width: '150px', height: '150px' }}>
              <img src="/riausatunet_logo.webp" alt="R1NET Logo" className="w-full h-auto object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">R1NET</h1>
              <p className="text-xs text-blue-400 font-semibold tracking-widest uppercase">NOC Division</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-sm font-medium text-slate-300">Laporan Bandwidth {periodLabel}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {snapshot.period === 'DAILY' 
                ? `${new Date(snapshot.endDate).toLocaleDateString('id-ID')} 00:00 - 23:59 WIB`
                : `${new Date(snapshot.startDate).toLocaleDateString('id-ID')} — ${new Date(snapshot.endDate).toLocaleDateString('id-ID')}`
              }
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        
        {/* Executive Summary Dashboard */}
        <section className="mb-10">
          <div className="bg-slate-800 rounded-xl p-6 sm:p-8 border border-slate-700 shadow-xl">
            <div className="mb-6 border-b border-slate-700 pb-4">
              <h3 className="text-lg font-semibold text-slate-200">Executive Summary</h3>
              <div className="text-sm text-slate-400 mt-1">
                Grup:{' '}
                {snapshot.groupName ? (
                  <span className="text-blue-400 font-medium">{snapshot.groupName}</span>
                ) : (
                  <button 
                    onClick={() => setShowAllGroups(!showAllGroups)}
                    className="text-blue-400 font-medium hover:text-blue-300 hover:underline transition-colors focus:outline-none"
                  >
                    Semua Grup
                  </button>
                )}
                {!snapshot.groupName && showAllGroups && uniqueGroups.length > 0 && (
                  <div className="mt-3 bg-slate-900/80 p-4 rounded-lg border border-slate-700/80 shadow-inner">
                    <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Daftar Grup yang Termasuk:</p>
                    <div className="flex flex-wrap gap-2">
                      {uniqueGroups.map((g, idx) => (
                        <span key={idx} className="bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded border border-slate-700">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/50 rounded-lg p-5 flex items-center gap-4 border border-slate-700/50">
                <div className="bg-slate-800 p-3 rounded-full">
                  <Server className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Sensor</p>
                  <p className="text-2xl font-bold text-slate-100">{totalConfigs}</p>
                </div>
              </div>
              
              <div className="bg-slate-900/50 rounded-lg p-5 flex items-center gap-4 border border-slate-700/50">
                <div className="bg-red-900/20 p-3 rounded-full">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Insiden Down</p>
                  <p className="text-2xl font-bold text-red-400">{totalDown}</p>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-5 flex items-center gap-4 border border-slate-700/50">
                <div className="bg-amber-900/20 p-3 rounded-full">
                  <Activity className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Low Traffic</p>
                  <p className="text-2xl font-bold text-amber-400">{totalLowTraffic}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Detailed Reports */}
        <section className="space-y-8">
          <h3 className="text-xl font-bold text-slate-200 border-l-4 border-blue-500 pl-3">Detail Laporan Sensor</h3>
          
          {snapshot.reportData.length === 0 ? (
            <div className="bg-slate-800 rounded-xl p-10 text-center border border-slate-700">
              <p className="text-slate-400">Tidak ada data sensor atau insiden yang tercatat pada periode ini.</p>
            </div>
          ) : (
            snapshot.reportData.map((config) => (
              <div key={config.configId} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
                {/* Config Header */}
                <div className="bg-slate-800/80 p-5 sm:p-6 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-blue-400 tracking-wider uppercase mb-1 block">{config.groupName}</span>
                    <h4 className="text-lg sm:text-xl font-bold text-slate-100">{config.title}</h4>
                  </div>
                  <div className="flex gap-3">
                    {config.downCount > 0 && (
                      <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1">
                        <ArrowDownCircle className="w-3 h-3" /> Down: {config.downCount}
                      </span>
                    )}
                    {config.lowTrafficCount > 0 && (
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1">
                        <Activity className="w-3 h-3" /> Low: {config.lowTrafficCount}
                      </span>
                    )}
                    {config.downCount === 0 && config.lowTrafficCount === 0 && (
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 text-xs font-semibold rounded-md">
                        Normal
                      </span>
                    )}
                  </div>
                </div>

                {/* Incidents List */}
                <div className="p-0 sm:p-2 bg-slate-900/30">
                  {config.incidents.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">Tidak ada catatan insiden.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-slate-300">
                        <thead className="text-xs uppercase bg-slate-800/50 text-slate-400 border-b border-slate-700">
                          <tr>
                            <th className="px-6 py-4 font-semibold">Waktu / Status</th>
                            <th className="px-6 py-4 font-semibold">Traffic In</th>
                            <th className="px-6 py-4 font-semibold">Traffic Out</th>
                            <th className="px-6 py-4 font-semibold">Total</th>
                            <th className="px-6 py-4 font-semibold text-center">Grafik</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                          {config.incidents.map((incident, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                              <td className="px-6 py-4 align-top">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${incident.status === 'DOWN' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                                      {incident.status === 'LOW_TRAFFIC' ? 'LOW TFC' : incident.status}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    {incident.formattedTime}
                                  </div>
                                  {incident.recoveryTime && (
                                    <div className="text-xs text-emerald-400 font-medium mt-1">
                                      Pulih: {new Date(incident.recoveryTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')} WIB
                                    </div>
                                  )}
                                </div>
                              </td>
                              
                              <td className="px-6 py-4 align-top">
                                {(incident.inboundBefore != null || incident.inboundDuring != null) ? (
                                  <div className="flex flex-col">
                                    <span className="text-slate-400 line-through text-xs">{incident.inboundBefore ? (incident.inboundBefore / 1000 / 1000).toFixed(2) : '0'}</span>
                                    <span className={`font-semibold ${incident.status === 'DOWN' ? 'text-red-400' : 'text-amber-400'}`}>
                                      {incident.inboundDuring ? (incident.inboundDuring / 1000 / 1000).toFixed(2) : '0'} <span className="text-[10px] text-slate-500 font-normal">Mbps</span>
                                    </span>
                                  </div>
                                ) : <span className="text-slate-500">-</span>}
                              </td>

                              <td className="px-6 py-4 align-top">
                                {(incident.outboundBefore != null || incident.outboundDuring != null) ? (
                                  <div className="flex flex-col">
                                    <span className="text-slate-400 line-through text-xs">{incident.outboundBefore ? (incident.outboundBefore / 1000 / 1000).toFixed(2) : '0'}</span>
                                    <span className={`font-semibold ${incident.status === 'DOWN' ? 'text-red-400' : 'text-amber-400'}`}>
                                      {incident.outboundDuring ? (incident.outboundDuring / 1000 / 1000).toFixed(2) : '0'} <span className="text-[10px] text-slate-500 font-normal">Mbps</span>
                                    </span>
                                  </div>
                                ) : <span className="text-slate-500">-</span>}
                              </td>

                              <td className="px-6 py-4 align-top">
                                {((incident.inboundBefore || 0) + (incident.outboundBefore || 0)) > 0 ? (
                                  <div className="flex flex-col">
                                    <span className="text-slate-400 line-through text-xs">
                                      {(((incident.inboundBefore || 0) + (incident.outboundBefore || 0)) / 1000 / 1000).toFixed(2)}
                                    </span>
                                    <span className={`font-bold ${incident.status === 'DOWN' ? 'text-red-400' : 'text-amber-400'}`}>
                                      {(((incident.inboundDuring || 0) + (incident.outboundDuring || 0)) / 1000 / 1000).toFixed(2)} <span className="text-[10px] text-slate-500 font-normal">Mbps</span>
                                    </span>
                                  </div>
                                ) : <span className="text-slate-500">-</span>}
                              </td>

                              <td className="px-6 py-4 align-top text-center">
                                <div 
                                  className="inline-block relative w-32 h-16 bg-slate-950 rounded border border-slate-700 cursor-pointer overflow-hidden group hover:border-blue-500 transition-colors"
                                  onClick={() => setOpenLightbox({ configId: config.configId, index: idx })}
                                >
                                  <img 
                                    src={`/api/public/receipt-reports/chart/${snapshot.id}/${config.sensorId}?sdate=${incident.sdate}&edate=${incident.edate}`} 
                                    alt="Chart preview" 
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all"
                                    loading="lazy"
                                  />
                                  <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-4 h-4 text-white" />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Lightbox for this config */}
                <Lightbox
                  open={openLightbox?.configId === config.configId}
                  close={() => setOpenLightbox(null)}
                  index={openLightbox?.configId === config.configId ? openLightbox.index : 0}
                  slides={config.incidents.map((inc) => ({
                    src: `/api/public/receipt-reports/chart/${snapshot.id}/${config.sensorId}?sdate=${inc.sdate}&edate=${inc.edate}`,
                    alt: `Chart for ${config.title} at ${inc.formattedTime}`,
                  }))}
                  plugins={[Zoom]}
                  carousel={{ finite: false }}
                  styles={{ container: { backgroundColor: "rgba(15, 23, 42, .95)" } }}
                />
              </div>
            ))
          )}
        </section>
      </main>

      <footer className="w-full border-t border-slate-800 bg-slate-950 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-500 font-medium">
            &copy; {new Date().getFullYear()} PT. Riau Satu Net. All rights reserved.
          </p>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest">
            Generated by PRTG R1NET Reporting Engine
          </p>
        </div>
      </footer>
    </div>
  );
}
