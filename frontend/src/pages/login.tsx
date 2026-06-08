import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Monitor } from 'lucide-react';

export default function LoginPage() {
  const { login, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to home
  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
      {/* Background abstract gradients */}
      <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-arc-gradient blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-arc-gradient blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-screen" />
      </div>
      
      <div className="relative w-full max-w-sm space-y-8 rounded-[24px] border border-border/50 bg-card/80 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.06)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-spring">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-arc-gradient text-white shadow-lg">
            <Monitor className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">PRTG Manager</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to your workspace</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive animate-in fade-in zoom-in duration-spring">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="h-11 rounded-xl bg-background/50 border-border/50 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary transition-all"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="h-11 rounded-xl bg-background/50 border-border/50 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary transition-all"
              required
            />
          </div>
          <Button type="submit" className="w-full h-11 rounded-xl bg-arc-gradient hover:opacity-90 transition-opacity font-medium text-[15px] shadow-md mt-2 text-white border-0" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
