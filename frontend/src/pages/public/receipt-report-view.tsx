import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicReportApi } from '@/lib/api';
import { Activity } from 'lucide-react';
import type { Snapshot } from './components/ReceiptReportV1';
import ReceiptReportV1 from './components/ReceiptReportV1';
import ReceiptReportV2 from './components/ReceiptReportV2';

export default function PublicReceiptReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reportUIVersion, setReportUIVersion] = useState<string>('v1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    publicReportApi.fetchReportSnapshot(id)
      .then((data) => {
        setSnapshot(data.snapshot);
        setReportUIVersion(data.reportUIVersion);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Report not found or link expired.');
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#ffffff] flex flex-col items-center justify-center space-y-4 font-[system-ui,-apple-system,sans-serif]">
        <Activity className="h-10 w-10 text-[#0066cc] animate-pulse" />
        <h2 className="text-[21px] font-semibold text-[#1d1d1f] tracking-[0.231px]">Loading Report...</h2>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col items-center justify-center p-4 font-[system-ui,-apple-system,sans-serif]">
        <div className="max-w-md w-full bg-[#ffffff] rounded-[18px] p-10 text-center shadow-[0_5px_30px_rgba(0,0,0,0.08)]">
          <Activity className="h-16 w-16 text-[#1d1d1f] mx-auto mb-6" />
          <h2 className="text-[28px] font-semibold text-[#1d1d1f] mb-2 tracking-[0.196px]">Report Unavailable</h2>
          <p className="text-[17px] text-[#86868b] tracking-[-0.374px]">{error || 'Invalid report link.'}</p>
        </div>
      </div>
    );
  }

  return reportUIVersion === 'v2' 
    ? <ReceiptReportV2 snapshot={snapshot} /> 
    : <ReceiptReportV1 snapshot={snapshot} />;
}
