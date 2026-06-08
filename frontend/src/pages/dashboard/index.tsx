import { Activity, Server, AlertCircle } from 'lucide-react';

export default function DashboardPage() {
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

      <div className="rounded-[24px] bg-card p-8 shadow-sm border border-border/50 min-h-[400px]">
        <h2 className="text-xl font-semibold mb-4">System Status Overview</h2>
        <div className="flex h-full items-center justify-center text-muted-foreground/50 border-2 border-dashed border-border/50 rounded-xl py-20">
          Chart or Detailed Data Here
        </div>
      </div>
    </div>
  );
}
