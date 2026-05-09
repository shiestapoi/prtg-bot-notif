import { cn } from '@/lib/utils';
import type { NocStatus } from '@/lib/types';

const statusConfig: Record<NocStatus, { label: string; className: string }> = {
  NORMAL: {
    label: 'Normal',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  LOW_TRAFFIC: {
    label: 'Low Traffic',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  NO_TRAFFIC: {
    label: 'Down',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  DOWN: {
    label: 'Down',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  POSSIBLE_FLAPPING: {
    label: 'Flapping',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  HIGH_UTILIZATION: {
    label: 'High Util',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  },
};

interface StatusBadgeProps {
  status: NocStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
      aria-label={`Status: ${config.label}`}
    >
      <span
        className={cn('mr-1.5 h-1.5 w-1.5 rounded-full', {
          'bg-green-500': status === 'NORMAL',
          'bg-yellow-500': status === 'LOW_TRAFFIC',
          'bg-orange-500': status === 'HIGH_UTILIZATION',
          'bg-red-500': status === 'DOWN' || status === 'NO_TRAFFIC' || status === 'POSSIBLE_FLAPPING',
        })}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
