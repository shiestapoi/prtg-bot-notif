import { useState, useRef, useEffect } from 'react';
import { Activity, Server, AlertCircle, Terminal } from 'lucide-react';
import { useMonitoringSSE } from '@/hooks/use-sse';
import type { PingLogEvent } from '@/lib/types';

export default function DashboardPage() {
  const [pingLogs, setPingLogs] = useState<PingLogEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useMonitoringSSE(undefined, {
    onPingLog: (event) => {
      setPingLogs((prev) => {
        const newLogs = [...prev, event];
        if (newLogs.length > 100) return newLogs.slice(newLogs.length - 100);
        return newLogs;
      });
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [pingLogs]);

  return (
    <div className="space-y-6 animate-in fade-in duration-spring">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of PRTG Report and NOC monitoring systems.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Widget 1 */}
        <div className="rounded-[20px] bg-card p-6 shadow-sm border border-border/50 flex flex-col gap-4 transition-all hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Servers</p>
              <p className="text-2xl font-bold">124</p>
            </div>
          </div>
        </div>

        {/* Widget 2 */}
        <div className="rounded-[20px] bg-card p-6 shadow-sm border border-border/50 flex flex-col gap-4 transition-all hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-arc-gradient text-white shadow-sm">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Monitors</p>
              <p className="text-2xl font-bold">1,892</p>
            </div>
          </div>
        </div>

        {/* Widget 3 */}
        <div className="rounded-[20px] bg-card p-6 shadow-sm border border-border/50 flex flex-col gap-4 transition-all hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Alerts</p>
              <p className="text-2xl font-bold">3</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] bg-card p-6 shadow-sm border border-border/50 min-h-[400px] flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Real-time Ping Logs</h2>
        </div>
        
        <div 
          ref={scrollRef}
          className="flex-1 bg-black text-green-400 font-mono text-sm p-4 rounded-xl overflow-y-auto max-h-[500px]"
        >
          {pingLogs.length === 0 ? (
            <div className="text-muted-foreground/50 italic flex items-center justify-center h-full">
              Waiting for incoming ping logs...
            </div>
          ) : (
            pingLogs.map((log, idx) => (
              <div key={idx} className="mb-1 leading-relaxed">
                <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                <span className="text-blue-400">{log.name}</span>{' '}
                <span className="text-gray-400">({log.host})</span>{' '}
                <span className={log.status === 'UP' ? 'text-green-500' : 'text-red-500 font-bold'}>
                  {log.status}
                </span>{' '}
                <span className="text-yellow-400">{log.latencyMs}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
