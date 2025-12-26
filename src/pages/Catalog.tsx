import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DashboardProducts from './dashboard/products/Products';
import ResourcesList from './booking/ResourcesList';

type CatalogTab = 'products' | 'events' | 'spaces';

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab') as CatalogTab | null;
  const [activeTab, setActiveTab] = useState<CatalogTab>(tabParam || 'products');

  useEffect(() => {
    // Sync tab state with URL
    if (tabParam && ['products', 'events', 'spaces'].includes(tabParam)) {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      // Default to products if no tab specified
      setSearchParams({ tab: 'products' }, { replace: true });
    }
  }, [tabParam, setSearchParams]);

  const handleTabChange = (value: string) => {
    const newTab = value as CatalogTab;
    setActiveTab(newTab);
    setSearchParams({ tab: newTab });
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden">
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
          </div>
        </div>

        <div className="w-full">
          <TabsContent value="products" className="mt-0">
            <DashboardProducts isEmbeddedInCatalog={true} />
          </TabsContent>

          <TabsContent value="events" className="mt-0">
            <div className="px-4 py-6">
              <ResourcesList typeFilter="event" />
            </div>
          </TabsContent>

          <TabsContent value="spaces" className="mt-0">
            <div className="px-4 py-6">
              <ResourcesList typeFilter="space" />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

