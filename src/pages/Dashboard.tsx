import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Calendar, Ticket, Loader2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface DashboardStats {
  productsCount: number;
  bookingsCount: number;
  upcomingEventsCount: number;
}

export default function Dashboard() {
  const { currentOrg } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    productsCount: 0,
    bookingsCount: 0,
    upcomingEventsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;

    const fetchStats = async () => {
      try {
        // Get products count
        const { count: productsCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id);

        // Get bookings count (both brand and venue)
        const { count: bookingsCount } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .or(`brand_org_id.eq.${currentOrg.id},venue_org_id.eq.${currentOrg.id}`);

        // Get upcoming events count
        const now = new Date().toISOString();
        const { count: upcomingEventsCount } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id)
          .gte('start_at', now);

        setStats({
          productsCount: productsCount || 0,
          bookingsCount: bookingsCount || 0,
          upcomingEventsCount: upcomingEventsCount || 0,
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
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Dashboard
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Welcome back to {currentOrg?.name || 'your organization'}
          </p>
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Products Card */}
            <Card className="rounded-3xl border shadow-xl hover:shadow-2xl transition-shadow" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                      Products
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Total products
                    </CardDescription>
                  </div>
                  <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                    <Package className="h-6 w-6" style={{ color: '#0E7A3A' }} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
                    {stats.productsCount}
                  </div>
                  <Link to="/dashboard/products">
                    <Button variant="ghost" size="sm" className="gap-2">
                      View all
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Bookings Card */}
            <Card className="rounded-3xl border shadow-xl hover:shadow-2xl transition-shadow" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                      Bookings
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Active bookings
                    </CardDescription>
                  </div>
                  <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                    <Calendar className="h-6 w-6" style={{ color: '#0E7A3A' }} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
                    {stats.bookingsCount}
                  </div>
                  <Link to="/dashboard/bookings">
                    <Button variant="ghost" size="sm" className="gap-2">
                      View all
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Events Card */}
            <Card className="rounded-3xl border shadow-xl hover:shadow-2xl transition-shadow" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                      Events
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Upcoming events
                    </CardDescription>
                  </div>
                  <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                    <Ticket className="h-6 w-6" style={{ color: '#0E7A3A' }} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
                    {stats.upcomingEventsCount}
                  </div>
                  <Link to="/dashboard/events">
                    <Button variant="ghost" size="sm" className="gap-2">
                      View all
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-semibold mb-4" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link to="/dashboard/products/new">
              <Card className="rounded-3xl border shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
                <CardHeader>
                  <CardTitle className="text-base" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                    Create Product
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Add a new product to your catalog
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/dashboard/events/new">
              <Card className="rounded-3xl border shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
                <CardHeader>
                  <CardTitle className="text-base" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                    Create Event
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Set up a new event with tickets
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/dashboard/inventory">
              <Card className="rounded-3xl border shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
                <CardHeader>
                  <CardTitle className="text-base" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                    Manage Inventory
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    View and adjust stock levels
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

