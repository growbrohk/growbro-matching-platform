import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Calendar,
  Ticket,
  Settings,
  LogOut,
  Menu,
  X,
  Handshake,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, currentOrg, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navItems = [
    { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/app/products', label: 'Products', icon: Package },
    { path: '/app/inventory', label: 'Inventory', icon: Warehouse },
    { path: '/app/bookings', label: 'Bookings', icon: Calendar },
    { path: '/app/events', label: 'Events & Tickets', icon: Ticket },
    { path: '/app/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/app/dashboard') {
      return location.pathname === '/app/dashboard';
    }
    if (path === '/app/products') {
      return location.pathname.startsWith('/app/products');
    }
    if (path === '/app/inventory') {
      return location.pathname.startsWith('/app/inventory');
    }
    if (path === '/app/bookings') {
      return location.pathname.startsWith('/app/bookings');
    }
    if (path === '/app/events') {
      return location.pathname.startsWith('/app/events');
    }
    if (path === '/app/settings') {
      return location.pathname.startsWith('/app/settings');
    }
    return false;
  };

  const userInitials = user?.email?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FBF8F4' }}>
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(14,122,58,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(14,122,58,0.05) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Top Header (sticky) */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{
          borderColor: "rgba(14,122,58,0.12)",
          backgroundColor: "rgba(251,248,244,0.86)",
        }}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            {/* Logo */}
            <Link to="/app/dashboard" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0E7A3A' }}>
                <Handshake className="h-5 w-5 text-white" />
              </div>
              <div className="leading-none">
                <div className="font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                  Growbro
                </div>
                <div className="text-xs" style={{ color: "rgba(15,31,23,0.6)" }}>
                  {currentOrg?.name || 'Organization'}
                </div>
              </div>
            </Link>

            {/* Desktop: User Menu */}
            <div className="hidden md:flex items-center gap-2">
              {/* Org Selector Placeholder */}
              {currentOrg && (
                <div className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: "rgba(15,31,23,0.75)", backgroundColor: "rgba(14,122,58,0.08)" }}>
                  {currentOrg.name}
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2" style={{ color: 'rgba(15,31,23,0.78)' }}>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden lg:inline text-sm font-medium">
                      {user?.email?.split('@')[0] || 'User'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile: Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ color: 'rgba(15,31,23,0.78)' }}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex max-w-[1400px] mx-auto">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:pt-16">
          <div className="flex-1 flex flex-col border-r" style={{ borderColor: "rgba(14,122,58,0.12)", backgroundColor: "rgba(251,248,244,0.5)" }}>
            <nav className="flex-1 px-2 py-4 space-y-1">
              {navItems.map((item) => (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant={isActive(item.path) ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-3 h-11',
                      isActive(item.path) && 'bg-primary/10 text-primary font-medium'
                    )}
                    style={!isActive(item.path) ? { color: 'rgba(15,31,23,0.75)' } : {}}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Button>
                </Link>
              ))}
            </nav>

            {/* User section at bottom */}
            <div className="p-4 border-t" style={{ borderColor: "rgba(14,122,58,0.12)" }}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start gap-3" style={{ color: 'rgba(15,31,23,0.78)' }}>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">
                      {user?.email?.split('@')[0] || 'User'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:pl-64">
          <div className="px-4 sm:px-6 lg:px-8 py-6 relative">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t backdrop-blur-xl" style={{ borderColor: "rgba(14,122,58,0.12)", backgroundColor: "rgba(251,248,244,0.95)" }}>
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          {navItems.slice(0, 4).map((item) => (
            <Link key={item.path} to={item.path} onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant={isActive(item.path) ? 'secondary' : 'ghost'}
                className={cn(
                  'flex flex-col h-auto py-2 gap-1',
                  isActive(item.path) && 'bg-primary/10 text-primary'
                )}
                style={!isActive(item.path) ? { color: 'rgba(15,31,23,0.75)' } : {}}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-xs">{item.label}</span>
              </Button>
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile Menu (full screen overlay) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div 
            className="absolute right-0 top-0 bottom-0 w-64 bg-background border-l shadow-xl"
            style={{ borderColor: "rgba(14,122,58,0.12)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b" style={{ borderColor: "rgba(14,122,58,0.12)" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold" style={{ fontFamily: "'Inter Tight', sans-serif" }}>Menu</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {currentOrg && (
                <div className="px-3 py-2 rounded-lg text-sm font-medium" style={{ color: "rgba(15,31,23,0.75)", backgroundColor: "rgba(14,122,58,0.08)" }}>
                  {currentOrg.name}
                </div>
              )}
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {navItems.map((item) => (
                <Link key={item.path} to={item.path} onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant={isActive(item.path) ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-3 h-11',
                      isActive(item.path) && 'bg-primary/10 text-primary font-medium'
                    )}
                    style={!isActive(item.path) ? { color: 'rgba(15,31,23,0.75)' } : {}}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Button>
                </Link>
              ))}
            </nav>
            <div className="p-4 border-t" style={{ borderColor: "rgba(14,122,58,0.12)" }}>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile content padding bottom */}
      <div className="md:hidden h-20" />
    </div>
  );
}

