import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Package, Boxes } from 'lucide-react';

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
        <p className="text-muted-foreground mt-1">Choose product type in {currentOrg?.name || 'your org'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/app/products/new?kind=simple')}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Simple Product</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-base">A single product with one price and stock level.</CardDescription>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/app/products/new?kind=variable')}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Boxes className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Variable Product</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-base">A product with multiple variants (e.g., Size, Color) and inventory per variant.</CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

