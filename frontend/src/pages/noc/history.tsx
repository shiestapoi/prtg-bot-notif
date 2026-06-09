import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { monitoringApi, prtgConfigApi } from '@/lib/api';
import type { MonitoringHistory, MonitoringSummaryItem, NocStatus, PrtgConfig } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/noc/StatusBadge';
import { SearchIcon, FilterXIcon, ChevronLeftIcon, ChevronRightIcon, CodeIcon } from 'lucide-react';

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'LOW_TRAFFIC', label: 'Low Traffic' },
  { value: 'NO_TRAFFIC', label: 'No Traffic' },
  { value: 'HIGH_UTILIZATION', label: 'High Utilization' },
  { value: 'POSSIBLE_FLAPPING', label: 'Flapping' },
  { value: 'DOWN', label: 'Down' },
];

const PAGE_SIZE = 50;

function formatBitrate(bitrate: number | null): string {
  if (bitrate === null) return '—';
  const mbit = bitrate / 1_000_000;
  return `${mbit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

export default function NocHistoryPage() {
  const [history, setHistory] = useState<MonitoringHistory[]>([]);
  const [configs, setConfigs] = useState<MonitoringSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  // Filter state
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // All PRTG configs (for sensorId lookup)
  const [allConfigs, setAllConfigs] = useState<PrtgConfig[]>([]);

  // JSON modal state
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [jsonContent, setJsonContent] = useState<string>('');
  const [jsonModalConfigId, setJsonModalConfigId] = useState<number | null>(null);

  // Derive unique groups from configs
  const groups = useMemo(() => {
    const groupSet = new Map<string, string>();
    for (const c of configs) {
      if (c.groupName && !groupSet.has(c.groupName)) {
        groupSet.set(c.groupName, c.groupName);
      }
    }
    return Array.from(groupSet.values()).sort();
  }, [configs]);

  // Filter configs by selected group
  const filteredConfigs = useMemo(() => {
    if (!selectedGroup) return configs;
    return configs.filter((c) => c.groupName === selectedGroup);
  }, [configs, selectedGroup]);

  // Fetch monitoring-enabled configs for the dropdown
  const fetchConfigs = async () => {
    try {
      const [data, configsData] = await Promise.all([
        monitoringApi.summary(),
        prtgConfigApi.getAll(),
      ]);
      setConfigs(data);
      setAllConfigs(configsData);
    } catch (err) {
      console.error('Failed to fetch monitoring configs:', err);
    }
  };

  // Use ref for configs to avoid infinite loop in fetchHistory
  const configsRef = useRef<MonitoringSummaryItem[]>([]);
  useEffect(() => { configsRef.current = configs; }, [configs]);

  const fetchHistory = useCallback(async (newOffset = 0) => {
    setSearching(true);
    try {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: newOffset,
      };
      if (selectedConfigId) {
        params.configId = Number(selectedConfigId);
      }
      if (fromDate) params.from = new Date(fromDate).toISOString();
      if (toDate) params.to = new Date(toDate).toISOString();
      if (selectedStatus) params.status = selectedStatus;

      const result = await monitoringApi.history(params);
      
      // Client-side group filtering when group is selected but no specific config
      let filteredData = result.data;
      if (selectedGroup && !selectedConfigId) {
        const groupConfigIds = new Set(
          configsRef.current.filter((c) => c.groupName === selectedGroup).map((c) => c.configId),
        );
        filteredData = result.data.filter((h) => groupConfigIds.has(h.configId));
      }
      
      setHistory(filteredData);
      setTotal(selectedGroup && !selectedConfigId ? filteredData.length : result.total);
      setOffset(newOffset);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setSearching(false);
      setLoading(false);
    }
  }, [selectedConfigId, selectedGroup, fromDate, toDate, selectedStatus]);

  // Initial load only
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchConfigs();
    void fetchHistory(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset config selection when group changes
  useEffect(() => {
    if (selectedGroup) {
      const configInGroup = filteredConfigs.find(
        (c) => String(c.configId) === selectedConfigId,
      );
      if (!configInGroup) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedConfigId('');
      }
    }
  }, [selectedGroup, filteredConfigs, selectedConfigId]);

  const clearFilters = () => {
    setSelectedGroup('');
    setSelectedConfigId('');
    setFromDate('');
    setToDate('');
    setSelectedStatus('');
  };

  const getConfigTitle = (configId: number) => {
    const config = configs.find((c) => c.configId === configId);
    return config?.title || `Config #${configId}`;
  };

  const getGroupName = (configId: number) => {
    const config = configs.find((c) => c.configId === configId);
    return config?.groupName || '—';
  };

  const showJson = (rawResponse: string, configId: number) => {
    try {
      const parsed = JSON.parse(rawResponse);
      setJsonContent(JSON.stringify(parsed, null, 2));
    } catch {
      setJsonContent(rawResponse);
    }
    setJsonModalConfigId(configId);
    setJsonModalOpen(true);
  };

  const hasActiveFilters =
    selectedGroup !== '' ||
    selectedConfigId !== '' ||
    fromDate !== '' ||
    toDate !== '' ||
    selectedStatus !== '';

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const goToPage = (page: number) => {
    const newOffset = (page - 1) * PAGE_SIZE;
    fetchHistory(newOffset);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">NOC History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View monitoring history with filtering by group, config, time range, and
          status.
        </p>
      </div>

      {/* Filter Controls */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label>Group</Label>
            <Select value={selectedGroup} onValueChange={(val) => setSelectedGroup(val ?? '')}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left">
                  {selectedGroup || 'All Groups'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Groups</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Config</Label>
            <Select value={selectedConfigId} onValueChange={(val) => setSelectedConfigId(val ?? '')}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left">
                  {selectedConfigId
                    ? configs.find((c) => String(c.configId) === selectedConfigId)?.title ?? 'Select config'
                    : 'All Configs'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Configs</SelectItem>
                {filteredConfigs.map((config) => (
                  <SelectItem key={config.configId} value={config.configId.toString()}>
                    {config.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fromDate">From</Label>
            <Input
              id="fromDate"
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="toDate">To</Label>
            <Input
              id="toDate"
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={selectedStatus} onValueChange={(val) => setSelectedStatus(val ?? '')}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left">
                  {selectedStatus
                    ? statusOptions.find((o) => o.value === selectedStatus)?.label ?? selectedStatus
                    : 'All Statuses'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button
              onClick={() => fetchHistory(0)}
              disabled={searching}
              className="flex-1"
            >
              <SearchIcon data-icon="inline-start" />
              {searching ? 'Searching...' : 'Search'}
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} size="icon">
                <FilterXIcon />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {history.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No history records found for the selected filters.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total} record{total !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Config</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Bitrate</TableHead>
                <TableHead>In / Out</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="w-[60px]">JSON</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(record.timestamp)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getGroupName(record.configId)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {getConfigTitle(record.configId)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={record.status as NocStatus} />
                  </TableCell>
                  <TableCell>
                    {formatBitrate(record.totalTrafficBitrate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="text-green-600 dark:text-green-400">↓{formatBitrate(record.inboundBitrate)}</span>
                    {' / '}
                    <span className="text-blue-600 dark:text-blue-400">↑{formatBitrate(record.outboundBitrate)}</span>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {record.errorMessage || '—'}
                  </TableCell>
                  <TableCell>
                    {record.rawResponse && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => showJson(record.rawResponse!, record.configId)}
                        title="Show raw JSON response"
                      >
                        <CodeIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
                aria-label="Previous page"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage >= totalPages}
                onClick={() => goToPage(currentPage + 1)}
                aria-label="Next page"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* JSON Response Modal */}
      <Dialog open={jsonModalOpen} onOpenChange={setJsonModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Raw PRTG Response</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] rounded-md bg-muted p-4">
            <pre className="text-xs whitespace-pre-wrap break-all font-mono">
              {(() => {
                const modalConfig = allConfigs.find(c => c.id === jsonModalConfigId);
                const summaryConfig = configs.find(c => c.configId === jsonModalConfigId);
                const sensorId = modalConfig?.sensorId ?? summaryConfig?.sensorId;
                const monitoringUrl = sensorId
                  ? `http://prtg.r1net.id/api/historicdata.json?id=${sensorId}&avg=0&usecaption=1`
                  : null;
                const graphUrl = sensorId
                  ? `http://prtg.r1net.id/graphzoom.htm?id=${sensorId}&graphid=1&clgid=&dynamicgraph=1`
                  : null;

                return (
                  <>
                    {monitoringUrl && (
                      <>
                        <span className="text-muted-foreground">Monitoring URL: </span>
                        <a href={monitoringUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline break-all">{monitoringUrl}</a>
                        {'\n'}
                      </>
                    )}
                    {graphUrl && (
                      <>
                        <span className="text-muted-foreground">Graph URL: </span>
                        <a href={graphUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline break-all">{graphUrl}</a>
                        {'\n'}
                      </>
                    )}
                    {(monitoringUrl || graphUrl) && '\n'}
                    <span className="text-muted-foreground">JSON Response:</span>
                    {'\n'}
                    {jsonContent}
                  </>
                );
              })()}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
