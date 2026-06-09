import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { NocGroup, NocMonitoredItem, NocSensitivity } from '@/lib/types';

export interface ItemFormData {
  label: string;
  endpointUrl: string;
  groupId: number | null;
  pollingInterval: number;
  thresholdLow: number;
  thresholdHigh: number;
  noTrafficCount: number;
  flappingWindow: number;
  flappingCount: number;
  downCount: number;
  sensitivity: NocSensitivity;
  cooldownInterval: number;
  rollingWindowSize: number;
  enabled: boolean;
}

const defaultFormData: ItemFormData = {
  label: '',
  endpointUrl: '',
  groupId: null,
  pollingInterval: 60,
  thresholdLow: 30,
  thresholdHigh: 90,
  noTrafficCount: 3,
  flappingWindow: 600,
  flappingCount: 4,
  downCount: 3,
  sensitivity: 'MEDIUM',
  cooldownInterval: 300,
  rollingWindowSize: 10,
  enabled: true,
};

interface ItemFormProps {
  groups: NocGroup[];
  initialData?: Partial<NocMonitoredItem>;
  onSubmit: (data: ItemFormData) => void;
  submitLabel?: string;
}

export function ItemForm({ groups, initialData, onSubmit, submitLabel = 'Save' }: ItemFormProps) {
  const [form, setForm] = useState<ItemFormData>(() => {
    if (initialData) {
      return {
        label: initialData.label ?? defaultFormData.label,
        endpointUrl: initialData.endpointUrl ?? defaultFormData.endpointUrl,
        groupId: initialData.groupId ?? defaultFormData.groupId,
        pollingInterval: initialData.pollingInterval ?? defaultFormData.pollingInterval,
        thresholdLow: initialData.thresholdLow ?? defaultFormData.thresholdLow,
        thresholdHigh: initialData.thresholdHigh ?? defaultFormData.thresholdHigh,
        noTrafficCount: initialData.noTrafficCount ?? defaultFormData.noTrafficCount,
        flappingWindow: initialData.flappingWindow ?? defaultFormData.flappingWindow,
        flappingCount: initialData.flappingCount ?? defaultFormData.flappingCount,
        downCount: initialData.downCount ?? defaultFormData.downCount,
        sensitivity: initialData.sensitivity ?? defaultFormData.sensitivity,
        cooldownInterval: initialData.cooldownInterval ?? defaultFormData.cooldownInterval,
        rollingWindowSize: initialData.rollingWindowSize ?? defaultFormData.rollingWindowSize,
        enabled: initialData.enabled ?? defaultFormData.enabled,
      };
    }
    return { ...defaultFormData };
  });

  useEffect(() => {
    if (initialData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        label: initialData.label ?? defaultFormData.label,
        endpointUrl: initialData.endpointUrl ?? defaultFormData.endpointUrl,
        groupId: initialData.groupId ?? defaultFormData.groupId,
        pollingInterval: initialData.pollingInterval ?? defaultFormData.pollingInterval,
        thresholdLow: initialData.thresholdLow ?? defaultFormData.thresholdLow,
        thresholdHigh: initialData.thresholdHigh ?? defaultFormData.thresholdHigh,
        noTrafficCount: initialData.noTrafficCount ?? defaultFormData.noTrafficCount,
        flappingWindow: initialData.flappingWindow ?? defaultFormData.flappingWindow,
        flappingCount: initialData.flappingCount ?? defaultFormData.flappingCount,
        downCount: initialData.downCount ?? defaultFormData.downCount,
        sensitivity: initialData.sensitivity ?? defaultFormData.sensitivity,
        cooldownInterval: initialData.cooldownInterval ?? defaultFormData.cooldownInterval,
        rollingWindowSize: initialData.rollingWindowSize ?? defaultFormData.rollingWindowSize,
        enabled: initialData.enabled ?? defaultFormData.enabled,
      });
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const updateField = <K extends keyof ItemFormData>(key: K, value: ItemFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" id="item-form">
      {/* Basic Info */}
      <div className="grid gap-2">
        <Label htmlFor="item-label">Label</Label>
        <Input
          id="item-label"
          value={form.label}
          onChange={(e) => updateField('label', e.target.value)}
          placeholder="e.g. Core Switch Uplink"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="item-endpoint">Endpoint URL</Label>
        <Input
          id="item-endpoint"
          value={form.endpointUrl}
          onChange={(e) => updateField('endpointUrl', e.target.value)}
          placeholder="https://prtg.example.com/api/historicdata.json?..."
          required
        />
      </div>

      <div className="grid gap-2">
        <Label>Group</Label>
        <Select
          value={form.groupId?.toString() ?? ''}
          onValueChange={(val) => updateField('groupId', val ? Number(val) : null)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a group" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id.toString()}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Polling & Thresholds */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="item-polling">Polling Interval (s)</Label>
          <Input
            id="item-polling"
            type="number"
            min={30}
            value={form.pollingInterval}
            onChange={(e) => updateField('pollingInterval', Number(e.target.value))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-cooldown">Cooldown (s)</Label>
          <Input
            id="item-cooldown"
            type="number"
            min={0}
            value={form.cooldownInterval}
            onChange={(e) => updateField('cooldownInterval', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="item-threshold-low">Threshold Low (%)</Label>
          <Input
            id="item-threshold-low"
            type="number"
            min={0}
            max={100}
            value={form.thresholdLow}
            onChange={(e) => updateField('thresholdLow', Number(e.target.value))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-threshold-high">Threshold High (%)</Label>
          <Input
            id="item-threshold-high"
            type="number"
            min={0}
            max={100}
            value={form.thresholdHigh}
            onChange={(e) => updateField('thresholdHigh', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="item-no-traffic">No Traffic Count</Label>
          <Input
            id="item-no-traffic"
            type="number"
            min={1}
            value={form.noTrafficCount}
            onChange={(e) => updateField('noTrafficCount', Number(e.target.value))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-down-count">Down Count</Label>
          <Input
            id="item-down-count"
            type="number"
            min={1}
            value={form.downCount}
            onChange={(e) => updateField('downCount', Number(e.target.value))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-rolling">Rolling Window</Label>
          <Input
            id="item-rolling"
            type="number"
            min={1}
            value={form.rollingWindowSize}
            onChange={(e) => updateField('rollingWindowSize', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="item-flap-window">Flapping Window (s)</Label>
          <Input
            id="item-flap-window"
            type="number"
            min={0}
            value={form.flappingWindow}
            onChange={(e) => updateField('flappingWindow', Number(e.target.value))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-flap-count">Flapping Count</Label>
          <Input
            id="item-flap-count"
            type="number"
            min={1}
            value={form.flappingCount}
            onChange={(e) => updateField('flappingCount', Number(e.target.value))}
          />
        </div>
      </div>

      {/* Sensitivity */}
      <div className="grid gap-2">
        <Label>Sensitivity</Label>
        <Select
          value={form.sensitivity}
          onValueChange={(val) => updateField('sensitivity', val as NocSensitivity)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Enabled */}
      <div className="flex items-center gap-3">
        <Switch
          checked={form.enabled}
          onCheckedChange={(val) => updateField('enabled', val)}
        />
        <Label>Enabled</Label>
      </div>

      <button type="submit" className="hidden" aria-label={submitLabel} />
    </form>
  );
}
