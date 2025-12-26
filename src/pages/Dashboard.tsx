// Dashboard is intentionally lightweight.
// Core functionality must live in Catalog, Collab, and Orders.
// Avoid adding heavy logic or admin tools here.

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Receipt, Handshake, Calendar, Plus, Package, Ticket, Users, ShoppingCart, Loader2, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface DashboardStats {
  ordersCount: number;
  collaborationsCount: number;
  upcomingCount: number;
}

export default function Dashboard() {
  const { currentOrg } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    ordersCount: 0,
    collaborationsCount: 0,
    upcomingCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;

    const fetchStats = async () => {
      try {
        // Orders count - using orders table (placeholder for now since it's not fully implemented)
        const { count: ordersCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id);

        // Collaborations count - placeholder (collab features are "coming soon")
        const collaborationsCount = 0;

        // Upcoming count - upcoming events + bookings
        const now = new Date().toISOString();
        const { count: upcomingEventsCount } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id)
          .gte('start_at', now);

        const { count: upcomingBookingsCount } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .or(`brand_org_id.eq.${currentOrg.id},venue_org_id.eq.${currentOrg.id}`)
          .gte('date', now.split('T')[0]);

        setStats({
          ordersCount: ordersCount || 0,
          collaborationsCount,
          upcomingCount: (upcomingEventsCount || 0) + (upcomingBookingsCount || 0),
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [currentOrg]);

  return (
    <div className="max-w-7xl space-y-4 md:space-y-8">
      {/* 1️⃣ Page Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Overview
        </p>
      </div>

      {/* 2️⃣ Status Summary Cards - Horizontal scroll on mobile, grid on desktop */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
        </div>
      ) : (
        <div 
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Orders Card */}
          <Link to="/app/orders" className="shrink-0 snap-start min-w-[180px] md:min-w-0">
            <Card className="rounded-xl md:rounded-2xl border hover:shadow-lg transition-shadow cursor-pointer h-full" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <CardHeader className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs md:text-sm font-medium" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Orders
                  </CardTitle>
                  <Receipt className="h-3.5 md:h-4 w-3.5 md:w-4" style={{ color: '#0E7A3A' }} />
                </div>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-xl md:text-2xl font-bold" style={{ color: '#0F1F17' }}>
                  {stats.ordersCount}
                </div>
                <p className="text-xs mt-0.5 md:mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
                  Recent orders
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Active Collaborations Card */}
          <Link to="/app/collab" className="shrink-0 snap-start min-w-[180px] md:min-w-0">
            <Card className="rounded-xl md:rounded-2xl border hover:shadow-lg transition-shadow cursor-pointer h-full" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <CardHeader className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs md:text-sm font-medium" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Collaborations
                  </CardTitle>
                  <Handshake className="h-3.5 md:h-4 w-3.5 md:w-4" style={{ color: '#0E7A3A' }} />
                </div>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-xl md:text-2xl font-bold" style={{ color: '#0F1F17' }}>
                  {stats.collaborationsCount}
                </div>
                <p className="text-xs mt-0.5 md:mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
                  Active partnerships
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Upcoming Card */}
          <Link to="/app/catalog" className="shrink-0 snap-start min-w-[180px] md:min-w-0">
            <Card className="rounded-xl md:rounded-2xl border hover:shadow-lg transition-shadow cursor-pointer h-full" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <CardHeader className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs md:text-sm font-medium" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Upcoming
                  </CardTitle>
                  <Calendar className="h-3.5 md:h-4 w-3.5 md:w-4" style={{ color: '#0E7A3A' }} />
                </div>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-xl md:text-2xl font-bold" style={{ color: '#0F1F17' }}>
                  {stats.upcomingCount}
                </div>
                <p className="text-xs mt-0.5 md:mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
                  Events & bookings
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* 3️⃣ Quick Actions - Horizontal scroll on mobile, grid on desktop */}
      <div className="space-y-2 md:space-y-3">
        <h2 className="text-base md:text-lg font-semibold" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Quick Actions
        </h2>
        <div 
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <Link to="/app/products/new" className="shrink-0 snap-start min-w-[140px] md:min-w-0">
            <Button 
              variant="outline" 
              className="w-full h-auto flex flex-col items-center gap-1.5 md:gap-2 py-3 md:py-4 rounded-xl md:rounded-2xl border hover:shadow-md transition-all"
              style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
            >
              <div className="h-8 md:h-10 w-8 md:w-10 rounded-lg md:rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                <Plus className="h-4 md:h-5 w-4 md:w-5" style={{ color: '#0E7A3A' }} />
              </div>
              <span className="text-xs md:text-sm font-medium" style={{ color: '#0F1F17' }}>Add Product</span>
            </Button>
          </Link>

          <Link to="/app/events/new" className="shrink-0 snap-start min-w-[140px] md:min-w-0">
            <Button 
              variant="outline" 
              className="w-full h-auto flex flex-col items-center gap-1.5 md:gap-2 py-3 md:py-4 rounded-xl md:rounded-2xl border hover:shadow-md transition-all"
              style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
            >
              <div className="h-8 md:h-10 w-8 md:w-10 rounded-lg md:rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                <Ticket className="h-4 md:h-5 w-4 md:w-5" style={{ color: '#0E7A3A' }} />
              </div>
              <span className="text-xs md:text-sm font-medium" style={{ color: '#0F1F17' }}>Create Event</span>
            </Button>
          </Link>

          <Link to="/app/collab" className="shrink-0 snap-start min-w-[140px] md:min-w-0">
            <Button 
              variant="outline" 
              className="w-full h-auto flex flex-col items-center gap-1.5 md:gap-2 py-3 md:py-4 rounded-xl md:rounded-2xl border hover:shadow-md transition-all"
              style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
            >
              <div className="h-8 md:h-10 w-8 md:w-10 rounded-lg md:rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                <Users className="h-4 md:h-5 w-4 md:w-5" style={{ color: '#0E7A3A' }} />
              </div>
              <span className="text-xs md:text-sm font-medium" style={{ color: '#0F1F17' }}>New Collab</span>
            </Button>
          </Link>

          <Link to="/app/orders" className="shrink-0 snap-start min-w-[140px] md:min-w-0">
            <Button 
              variant="outline" 
              className="w-full h-auto flex flex-col items-center gap-1.5 md:gap-2 py-3 md:py-4 rounded-xl md:rounded-2xl border hover:shadow-md transition-all"
              style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
            >
              <div className="h-8 md:h-10 w-8 md:w-10 rounded-lg md:rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                <ShoppingCart className="h-4 md:h-5 w-4 md:w-5" style={{ color: '#0E7A3A' }} />
              </div>
              <span className="text-xs md:text-sm font-medium" style={{ color: '#0F1F17' }}>View Orders</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 4️⃣ Recent Activity Feed */}
      <div className="space-y-2 md:space-y-3">
        <h2 className="text-base md:text-lg font-semibold" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Recent Activity
        </h2>
        <Card className="rounded-xl md:rounded-2xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardContent className="p-6 md:p-8 text-center">
            <div className="flex flex-col items-center gap-2 md:gap-3">
              <div className="h-10 md:h-12 w-10 md:w-12 rounded-xl md:rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                <Clock className="h-5 md:h-6 w-5 md:w-6" style={{ color: '#0E7A3A' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  No recent activity yet
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

