import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import type { NocMonitoredItem } from '@/lib/types';

interface MetricCardProps {
  item: NocMonitoredItem;
}

function formatLastPolled(lastPolledAt: string | null): string {
  if (!lastPolledAt) return 'Never polled';
  const date = new Date(lastPolledAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString();
}

export function MetricCard({ item }: MetricCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="truncate text-sm" title={item.label}>
          {item.label}
        </CardTitle>
        <CardAction>
          <StatusBadge status={item.lastStatus} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Last polled</span>
            <span className="font-medium text-foreground">
              {formatLastPolled(item.lastPolledAt)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Polling interval</span>
            <span className="font-medium text-foreground">{item.pollingInterval}s</span>
          </div>
          {!item.enabled && (
            <div className="mt-1 rounded bg-muted px-2 py-0.5 text-center text-xs text-muted-foreground">
              Disabled
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
