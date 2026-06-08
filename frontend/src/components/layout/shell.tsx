import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Toaster } from '@/components/ui/sonner';
import { Sidebar } from './sidebar';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

export function Shell() {
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile, shown on md+ */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-spring ease-out md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* Main Canvas Container - Inset and rounded on md+ */}
      <div className="flex-1 overflow-hidden md:p-2 md:pl-0 flex flex-col transition-all duration-spring">
        <main className="flex-1 overflow-y-auto bg-background text-foreground md:rounded-2xl border-l md:border border-border/50 shadow-elevated relative">
          {/* Mobile header with hamburger */}
          <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border/50 bg-background/80 backdrop-blur-md px-4 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
              className="text-foreground"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <span className="ml-2 font-semibold tracking-tight text-foreground">PRTG Manager</span>
          </div>
          <div className="mx-auto p-4 md:p-8 animate-in fade-in duration-spring">
            <Outlet />
          </div>
        </main>
      </div>

      <div onClick={(e) => {
        const target = e.target as HTMLElement;
        const toastEl = target.closest('[data-sonner-toast]');
        if (toastEl) {
          const closeBtn = toastEl.querySelector('[data-close-button]') as HTMLButtonElement | null;
          if (closeBtn) closeBtn.click();
        }
      }}>
        <Toaster 
          position="top-right" 
          richColors 
          closeButton 
          toastOptions={{ 
            className: 'cursor-pointer'
          }} 
        />
      </div>
    </div>
  );
}
