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
  Settings,
  MessageCircle,
  LogOut,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  { label: 'Recipients', href: '/report/recipients', icon: Send },
];

const nocNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/noc/dashboard', icon: LayoutDashboard },
  { label: 'History', href: '/noc/history', icon: History },
  { label: 'Alert Recipients', href: '/monitoring/recipients', icon: Bell },
];

const settingsNavItems: NavItem[] = [
  { label: 'PRTG Setting', href: '/settings/prtg', icon: Settings },
  { label: 'WhatsApp', href: '/settings/whatsapp', icon: MessageCircle },
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
      <h3 className="mb-1 px-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink key={item.href} to={item.href} onClick={onNavigate}>
            {({ isActive }) => (
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'w-full justify-start gap-2',
                  isActive && 'font-medium',
                )}
              >
                <item.icon className="h-4 w-4" />
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
    <aside className="flex h-screen w-60 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <NavLink to="/" className="flex items-center gap-2 font-semibold" onClick={onNavigate}>
          <Monitor className="h-5 w-5" />
          <span>PRTG Manager</span>
        </NavLink>
      </div>
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-1 py-2">
          <NavSection title="Report" items={reportNavItems} onNavigate={onNavigate} />
          <Separator className="mx-3" />
          <NavSection title="NOC" items={nocNavItems} onNavigate={onNavigate} />
          <Separator className="mx-3" />
          <NavSection title="Settings" items={settingsNavItems} onNavigate={onNavigate} />
        </nav>
      </ScrollArea>
      <div className="border-t p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground truncate">{user?.username}</span>
          <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </Button>
        </div>
      </div>
    </aside>
  );
}
