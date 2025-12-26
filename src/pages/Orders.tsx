import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Receipt, Package, Ticket, Calendar, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type OrderType = 'products' | 'tickets' | 'bookings';

export default function Orders() {
  const [selectedFilter, setSelectedFilter] = useState<OrderType>('products');

  const filters: { type: OrderType; label: string; icon: React.ElementType }[] = [
    { type: 'products', label: 'Products', icon: Package },
    { type: 'tickets', label: 'Tickets', icon: Ticket },
    { type: 'bookings', label: 'Bookings', icon: Calendar },
  ];

  return (
    <div className="max-w-7xl space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.1)' }}>
            <Receipt className="h-5 w-5" style={{ color: '#0E7A3A' }} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Orders
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Manage all orders, tickets, and bookings in one place
        </p>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const Icon = filter.icon;
          const isActive = selectedFilter === filter.type;
          return (
            <Button
              key={filter.type}
              variant={isActive ? 'default' : 'outline'}
              onClick={() => setSelectedFilter(filter.type)}
              className={cn(
                'h-10 rounded-full gap-2',
                isActive && 'shadow-lg'
              )}
              style={isActive ? { backgroundColor: '#0E7A3A', color: 'white' } : { color: 'rgba(15,31,23,0.75)' }}
            >
              <Icon className="h-4 w-4" />
              {filter.label}
            </Button>
          );
        })}
      </div>

      {/* Empty State */}
      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardContent className="p-8 md:p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-3xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
              <ShoppingCart className="h-8 w-8" style={{ color: '#0E7A3A' }} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
                No {filters.find(f => f.type === selectedFilter)?.label} Orders Yet
              </h3>
              <p className="text-sm max-w-md mx-auto" style={{ color: 'rgba(15,31,23,0.72)' }}>
                {selectedFilter === 'products' && 'Product orders will appear here when customers purchase items from your catalog.'}
                {selectedFilter === 'tickets' && 'Ticket orders will appear here when customers buy tickets to your events.'}
                {selectedFilter === 'bookings' && 'Booking orders will appear here when venues or brands make space reservations.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
              <Package className="h-5 w-5" style={{ color: '#0E7A3A' }} />
              Products
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              Track physical product sales and shipping
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
              0
            </div>
            <p className="text-xs mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
              Total orders
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
              <Ticket className="h-5 w-5" style={{ color: '#0E7A3A' }} />
              Tickets
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              Manage event ticket sales
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
              0
            </div>
            <p className="text-xs mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
              Total tickets sold
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
              <Calendar className="h-5 w-5" style={{ color: '#0E7A3A' }} />
              Bookings
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              View space reservation orders
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
              0
            </div>
            <p className="text-xs mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
              Total bookings
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

