import { useEffect, useState, Suspense, lazy } from 'react';
import { prtgSettingApi } from '@/lib/api';
import Loader from '@/components/ui/loader';

const TvV1 = lazy(() => import('./tv-v1'));
const TvV2 = lazy(() => import('./tv-v2'));

export default function NocTvDashboardPage() {
  const [uiVersion, setUiVersion] = useState<'v1' | 'v2' | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    
    async function checkVersion() {
      try {
        const settings = await prtgSettingApi.get();
        const serverVersion = (settings.tvUIVersion as 'v1' | 'v2') || 'v1';
        
        setUiVersion((prev) => {
          if (prev === null) {
            return serverVersion; // Initial load
          }
          if (prev !== serverVersion) {
            setIsTransitioning(true);
            setTimeout(() => {
              setIsTransitioning(false);
            }, 1500); // 1.5s transition
            return serverVersion;
          }
          return prev;
        });
      } catch (err) {
        // silent
      }
    }

    checkVersion();
    intervalId = setInterval(checkVersion, 5000); // Poll every 5s

    return () => clearInterval(intervalId);
  }, []);

  if (uiVersion === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <Loader />
      </div>
    );
  }

  return (
    <>
      {isTransitioning && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0a0a] text-white">
          <Loader />
          <h2 className="mt-4 text-xl font-bold tracking-tight text-[#fadb14] animate-pulse">
            Switching UI to {uiVersion.toUpperCase()}...
          </h2>
        </div>
      )}
      
      <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#0a0a0a]"><Loader /></div>}>
        {uiVersion === 'v1' ? <TvV1 /> : <TvV2 />}
      </Suspense>
    </>
  );
}
