import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  Send,
  LayoutDashboard,
  Layers,
  Monitor,
  History,
  Bell,
  Activity,
  Tv,
  Settings,
  MessageCircle,
  LogOut,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const reportNavItems: NavItem[] = [
  { label: 'Groups', href: '/report/groups', icon: Layers },
  { label: 'Configs', href: '/report/configs', icon: BarChart3 },
  { label: 'Schedules', href: '/report/schedules', icon: Calendar },
  { label: 'Receipts', href: '/report/receipt-schedules', icon: Calendar },
  { label: 'Receipt History', href: '/report/receipt-history', icon: History },
  { label: 'Receipt Recipients', href: '/report/receipt-recipients', icon: Send },
  { label: 'Recipients', href: '/report/recipients', icon: Send },
];

const nocNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/noc/dashboard', icon: LayoutDashboard },
  { label: 'TV Display', href: '/tv', icon: Tv },
  { label: 'History', href: '/noc/history', icon: History },
  { label: 'Alert Recipients', href: '/monitoring/recipients', icon: Bell },
  { label: 'Ping Monitoring', href: '/monitoring/ping', icon: Activity },
  { label: 'Ping Recipients', href: '/monitoring/ping-recipients', icon: Send },
];

const settingsNavItems: NavItem[] = [
  { label: 'PRTG Setting', href: '/settings/prtg', icon: Settings },
  { label: 'WhatsApp', href: '/settings/whatsapp', icon: MessageCircle },
  { label: 'Telegram', href: '/settings/telegram', icon: Send },
  { label: 'Suara Alarm', href: '/settings/sounds', icon: Activity }, // Lucide Activity/FileAudio
  { label: 'Akun', href: '/settings/account', icon: User },
];

function NavSection({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <div className="px-3 py-2">
      <h3 className="mb-2 px-2 text-[11px] font-bold tracking-widest text-sidebar-foreground/50 uppercase">
        {title}
      </h3>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink key={item.href} to={item.href} onClick={onNavigate}>
            {({ isActive }) => (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'w-full justify-start gap-2 h-8 rounded-lg transition-all',
                  isActive 
                    ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium hover:bg-sidebar-primary/20 hover:text-sidebar-primary' 
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50")} />
                {item.label}
              </Button>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex h-14 shrink-0 items-center px-5 pt-2">
        <NavLink to="/" className="flex items-center gap-2.5 font-bold tracking-tight transition-opacity hover:opacity-80" onClick={onNavigate}>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-arc-gradient text-white shadow-sm">
            <Monitor className="h-4 w-4" />
          </div>
          <span>PRTG Manager</span>
        </NavLink>
      </div>
      <div className="flex-1 overflow-y-auto mt-4 px-2 custom-scrollbar">
        <nav className="flex flex-col gap-1 pb-4">
          <NavSection title="Report" items={reportNavItems} onNavigate={onNavigate} />
          <div className="px-3 my-2"><Separator className="bg-sidebar-border" /></div>
          <NavSection title="NOC" items={nocNavItems} onNavigate={onNavigate} />
          <div className="px-3 my-2"><Separator className="bg-sidebar-border" /></div>
          <NavSection title="Settings" items={settingsNavItems} onNavigate={onNavigate} />
        </nav>
      </div>
      <div className="shrink-0 p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between rounded-xl bg-sidebar-accent/50 p-2 border border-sidebar-border/50">
          <div className="flex items-center gap-2 overflow-hidden px-1">
            <div className="h-6 w-6 shrink-0 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-[10px] font-bold text-sidebar-primary uppercase">
              {user?.username?.charAt(0) || 'U'}
            </div>
            <span className="text-sm font-medium truncate">{user?.username}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="h-7 w-7 shrink-0 text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 rounded-lg" title="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
