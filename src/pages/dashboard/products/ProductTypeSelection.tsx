import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Package, Building2 } from 'lucide-react';

export default function ProductTypeSelection() {
  const navigate = useNavigate();
  const { currentOrg } = useAuth();

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/app/products')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Products
        </Button>
        <h1 className="text-3xl font-bold">Create Product</h1>
        <p className="text-muted-foreground mt-1">Choose what you want to create in {currentOrg?.name || 'your org'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/app/products/new?type=physical')}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Physical Product</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-base">Sell a product with optional variants and inventory.</CardDescription>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/app/products/new?type=venue_asset')}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Venue Asset</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-base">Create a bookable venue resource (used by Bookings).</CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

