import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductType, ProductOwnerType } from '@/lib/types';
import { ArrowLeft, Package, Ticket, Building2, Image, ShoppingBag, Coffee } from 'lucide-react';

interface ProductTypeOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  product_type: ProductType;
  owner_type: ProductOwnerType;
}

const BRAND_PRODUCT_TYPES: ProductTypeOption[] = [
  {
    id: 'simple-product',
    label: 'Simple Product',
    description: 'Single product with one price and inventory (no variations)',
    icon: Package,
    product_type: 'simple',
    owner_type: 'brand',
  },
  {
    id: 'variable-product',
    label: 'Variable Product',
    description: 'Product with variations (size, color, etc.) and inventory',
    icon: Package,
    product_type: 'variable',
    owner_type: 'brand',
  },
  {
    id: 'event-tickets',
    label: 'Event Tickets',
    description: 'Event tickets, workshops, classes, or admission passes',
    icon: Ticket,
    product_type: 'event',
    owner_type: 'brand',
  },
];

const VENUE_PRODUCT_TYPES: ProductTypeOption[] = [
  {
    id: 'venue-rental',
    label: 'Venue Rental',
    description: 'Rent out your venue space for events',
    icon: Building2,
    product_type: 'space',
    owner_type: 'venue',
  },
  {
    id: 'poster-space',
    label: 'Poster Space',
    description: 'Wall space for posters and marketing materials',
    icon: Image,
    product_type: 'space',
    owner_type: 'venue',
  },
  {
    id: 'consignment-space',
    label: 'Consignment Space',
    description: 'Shelf or display space for consignment products',
    icon: ShoppingBag,
    product_type: 'space',
    owner_type: 'venue',
  },
  {
    id: 'cup-sleeve',
    label: 'Cup Sleeve',
    description: 'Cup sleeve marketing space',
    icon: Coffee,
    product_type: 'space',
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

  // Show loading state if profile is not loaded yet
  if (!profile) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const getBackPath = () => {
    return '/dashboard/products';
  };

  const handleTypeSelect = (type: ProductTypeOption) => {
    // If Event Tickets, navigate to the new event ticketing form
    if (type.product_type === 'event' || type.id === 'event-tickets') {
      navigate('/events/new');
      return;
    }
    
    // For other product types, navigate to product form with pre-filled type
    const params = new URLSearchParams({
      product_type: type.product_type,
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
                  Create a product for your brand (physical items, event tickets)
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

  // Determine which product types to show
  // Default to brand if owner_type is not specified or user is not a venue
  const effectiveOwnerType = ownerTypeParam || 'brand';
  const isVenueRequestingVenue = effectiveOwnerType === 'venue';
  
  // Validate: non-venue users cannot create venue products
  if (isVenueRequestingVenue && !isVenue) {
    // Redirect to brand products
    return (
      <Layout>
        <div className="container mx-auto py-8 px-4 max-w-4xl">
          <div className="mb-6">
            <Button variant="ghost" onClick={() => navigate(getBackPath())} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Products
            </Button>
            <h1 className="text-3xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground mt-1">
              Only venue users can create venue products.
            </p>
          </div>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                You need to be a venue user to create venue products.
              </p>
              <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=brand')}>
                Create Brand Product Instead
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const productTypes = isVenueRequestingVenue ? VENUE_PRODUCT_TYPES : BRAND_PRODUCT_TYPES;
  const title = isVenueRequestingVenue ? 'Create Venue Product' : 'Create Brand Product';
  const subtitle =
    isVenueRequestingVenue
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>
    </Layout>
  );
}

