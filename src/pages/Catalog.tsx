import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DashboardProducts from './dashboard/products/Products';
import SpacesList from './booking/ResourcesList';
import EventsList from './events/EventsList.new';

type CatalogTab = 'products' | 'events' | 'spaces';
type ProductsSubtab = 'catalog' | 'pos' | 'orders';

const PRODUCTS_SUBTABS: ProductsSubtab[] = ['catalog', 'pos', 'orders'];

function parseProductsSubtab(value: string | null): ProductsSubtab {
  if (value && PRODUCTS_SUBTABS.includes(value as ProductsSubtab)) {
    return value as ProductsSubtab;
  }
  return 'catalog';
}

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as CatalogTab | null;
  const productsSubtabParam = searchParams.get('productsSubtab');
  const [activeTab, setActiveTab] = useState<CatalogTab>(tabParam || 'products');
  const [productsSubtab, setProductsSubtab] = useState<ProductsSubtab>(
    parseProductsSubtab(productsSubtabParam)
  );

  useEffect(() => {
    // Sync tab state with URL
    if (tabParam && ['products', 'events', 'spaces'].includes(tabParam)) {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      // Default to products if no tab specified
      const params = new URLSearchParams(searchParams);
      params.set('tab', 'products');
      setSearchParams(params, { replace: true });
    }
  }, [tabParam, searchParams, setSearchParams]);

  useEffect(() => {
    setProductsSubtab(parseProductsSubtab(productsSubtabParam));
  }, [productsSubtabParam]);

  const handleTabChange = (value: string) => {
    const newTab = value as CatalogTab;
    setActiveTab(newTab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', newTab);
    setSearchParams(params);
  };

  const handleProductsSubtabChange = (value: string) => {
    const subtab = value as ProductsSubtab;
    setProductsSubtab(subtab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'products');
    params.set('productsSubtab', subtab);
    setSearchParams(params);
  };

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="sticky top-0 z-10 backdrop-blur-xl border-b" style={{
          borderColor: "rgba(14,122,58,0.12)",
          backgroundColor: "rgba(251,248,244,0.95)",
        }}>
          <div className="px-4 py-3">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="spaces">Spaces</TabsTrigger>
            </TabsList>

            {activeTab === 'products' && (
              <div className="mt-2">
                <Tabs value={productsSubtab} onValueChange={handleProductsSubtabChange}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="catalog">Catalog</TabsTrigger>
                    <TabsTrigger value="pos">POS</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
          </div>
        </div>

        <div className="w-full min-w-0">
          <TabsContent value="products" className="mt-0">
            <DashboardProducts
              isEmbeddedInCatalog={true}
              selectedSubtab={productsSubtab}
              onChangeSubtab={handleProductsSubtabChange}
            />
          </TabsContent>

          <TabsContent value="events" className="mt-0">
            <div className="w-full min-w-0">
              <EventsList isEmbeddedInCatalog={true} />
            </div>
          </TabsContent>

          <TabsContent value="spaces" className="mt-0">
            <div className="w-full min-w-0">
              <SpacesList isEmbeddedInCatalog={true} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

