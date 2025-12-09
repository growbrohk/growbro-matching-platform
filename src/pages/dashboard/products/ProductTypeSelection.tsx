import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductClass, ProductOwnerType } from '@/lib/types';
import { ArrowLeft, Package, Ticket, Calendar, Building2, Image, ShoppingBag, Coffee } from 'lucide-react';

interface ProductTypeOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  product_class: ProductClass;
  owner_type: ProductOwnerType;
}

const BRAND_PRODUCT_TYPES: ProductTypeOption[] = [
  {
    id: 'physical',
    label: 'Product',
    description: 'Physical variable product with inventory (merchandise, items, etc.)',
    icon: Package,
    product_class: 'physical',
    owner_type: 'brand',
  },
  {
    id: 'ticket',
    label: 'Event',
    description: 'Event ticket or admission pass',
    icon: Ticket,
    product_class: 'ticket',
    owner_type: 'brand',
  },
  {
    id: 'booking',
    label: 'Workshop',
    description: 'Bookable workshop, class, or service session',
    icon: Calendar,
    product_class: 'booking',
    owner_type: 'brand',
  },
];

const VENUE_PRODUCT_TYPES: ProductTypeOption[] = [
  {
    id: 'venue-rental',
    label: 'Venue Rental',
    description: 'Rent out your venue space for events',
    icon: Building2,
    product_class: 'space',
    owner_type: 'venue',
  },
  {
    id: 'poster-space',
    label: 'Poster Space',
    description: 'Wall space for posters and marketing materials',
    icon: Image,
    product_class: 'space',
    owner_type: 'venue',
  },
  {
    id: 'consignment-space',
    label: 'Consignment Space',
    description: 'Shelf or display space for consignment products',
    icon: ShoppingBag,
    product_class: 'space',
    owner_type: 'venue',
  },
  {
    id: 'cup-sleeve',
    label: 'Cup Sleeve',
    description: 'Cup sleeve marketing space',
    icon: Coffee,
    product_class: 'space',
    owner_type: 'venue',
  },
];

export default function ProductTypeSelection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const ownerTypeParam = searchParams.get('owner_type') as ProductOwnerType | null;
  const [selectedOwnerType, setSelectedOwnerType] = useState<ProductOwnerType>(
    ownerTypeParam || 'brand'
  );

  // Determine which product types to show
  const isVenue = profile?.is_venue === true;
  const showOwnerTypeSelector = isVenue && !ownerTypeParam;

  const getBackPath = () => {
    return '/dashboard/products';
  };

  const handleTypeSelect = (type: ProductTypeOption) => {
    // Navigate to product form with pre-filled type
    const params = new URLSearchParams({
      product_class: type.product_class,
      owner_type: type.owner_type,
      product_type_id: type.id,
    });
    navigate(`/dashboard/products/new?${params.toString()}`);
  };

  // If venue user and no owner_type specified, show selector first
  if (showOwnerTypeSelector) {
    return (
      <Layout>
        <div className="container mx-auto py-8 px-4 max-w-4xl">
          <div className="mb-6">
            <Button variant="ghost" onClick={() => navigate(getBackPath())} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Products
            </Button>
            <h1 className="text-3xl font-bold">Create Product</h1>
            <p className="text-muted-foreground mt-1">
              Choose whether to create a brand product or venue product
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setSelectedOwnerType('brand')}
            >
              <CardHeader>
                <CardTitle>Brand Product</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Create a product for your brand (physical items, events, workshops)
                </CardDescription>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setSelectedOwnerType('venue')}
            >
              <CardHeader>
                <CardTitle>Venue Product</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Create a venue offering (rental space, consignment, poster space, cup sleeve)
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={() => navigate(`/dashboard/products/select-type?owner_type=${selectedOwnerType}`)}>
              Continue
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const productTypes = ownerTypeParam === 'venue' ? VENUE_PRODUCT_TYPES : BRAND_PRODUCT_TYPES;
  const title = ownerTypeParam === 'venue' ? 'Create Venue Product' : 'Create Brand Product';
  const subtitle =
    ownerTypeParam === 'venue'
      ? 'Choose the type of venue offering you want to create'
      : 'Choose the type of product you want to create';

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(getBackPath())} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {productTypes.map((type) => {
            const Icon = type.icon;
            return (
              <Card
                key={type.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleTypeSelect(type)}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{type.label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">{type.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {showVenueProducts && !isVenue && (
          <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">
              Note: Only venue users can create venue products. You will be redirected to brand products.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

