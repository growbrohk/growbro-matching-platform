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
  Home,
  Search,
  MessageCircle,
  Handshake,
  Package,
  User,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navItems = [
    { path: '/home', label: 'Home', icon: Home },
    { path: '/browse', label: 'Browse', icon: Search },
    { path: '/collabs', label: 'Collabs', icon: Handshake },
    { path: '/messages', label: 'Messages', icon: MessageCircle },
    { path: '/dashboard/products', label: 'Products', icon: Package },
    { path: '/dashboard/inventory', label: 'Inventory', icon: Package },
    // Venue features removed - Spaces page has been deleted
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard/products') {
      return location.pathname.startsWith('/dashboard/products') && 
             !location.pathname.includes('/select-type') &&
             !location.pathname.includes('/new') &&
             !location.pathname.match(/\/dashboard\/products\/[^/]+\/edit/);
    }
    if (path === '/dashboard/inventory') {
      return location.pathname.startsWith('/dashboard/inventory') ||
             location.pathname.startsWith('/dashboard/brand/inventory') ||
             location.pathname.startsWith('/dashboard/venue/inventory');
    }
    return location.pathname === path;
  };

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

      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{
          borderColor: "rgba(14,122,58,0.12)",
          backgroundColor: "rgba(251,248,244,0.86)",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="h-16 flex items-center justify-between">
            {/* Logo */}
            <Link to="/home" className="flex items-center gap-3">
              <img 
                src="/growbro-logo.jpg" 
                alt="GrowBro Logo" 
                className="h-9 w-9 rounded-xl object-cover"
              />
              <div className="leading-none">
                <div className="font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                  Growbro
                </div>
                <div className="text-xs" style={{ color: "rgba(15,31,23,0.6)" }}>
                  Online ↔ Offline Collaboration
                </div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant={isActive(item.path) ? 'secondary' : 'ghost'}
                    className={cn(
                      'gap-2',
                      isActive(item.path) && 'bg-primary/10 text-primary'
                    )}
                    style={isActive(item.path) ? {} : { color: 'rgba(15,31,23,0.75)' }}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              ))}
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2" style={{ color: 'rgba(15,31,23,0.78)' }}>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile?.avatar_url} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-medium">
                      {profile?.display_name || 'User'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to={`/profiles/${profile?.handle}`} className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      View Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Menu Toggle */}
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

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <nav className="md:hidden border-t p-4 animate-in" style={{ backgroundColor: 'rgba(251,248,244,0.95)', borderColor: 'rgba(14,122,58,0.12)' }}>
              <div className="flex flex-col gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Button
                      variant={isActive(item.path) ? 'secondary' : 'ghost'}
                      className={cn(
                        'w-full justify-start gap-2',
                        isActive(item.path) && 'bg-primary/10 text-primary'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8 relative">{children}</main>
    </div>
  );
}
