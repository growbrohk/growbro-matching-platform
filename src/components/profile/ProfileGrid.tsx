import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PosterSpace } from '@/lib/api/poster-spaces';
import { Event } from '@/lib/types';
import { Product } from '@/lib/types';

interface GridItem {
  id: string;
  type: 'space' | 'product' | 'event';
  title: string;
  imageUrl: string | null;
  shortCode?: string; // for spaces
  slug?: string; // for events
  orgSlug?: string; // for navigation
  created_at: string;
}

export type TabVariant = 'owner' | 'brand_public';
export type BrandPublicFilter = 'all' | 'products' | 'events';

export interface ProfileGridProps {
  orgId: string;
  orgSlug?: string | null;
  mode: 'owner' | 'public';
  tabVariant?: TabVariant;
}

export default function ProfileGrid({ orgId, orgSlug, mode, tabVariant = 'owner' }: ProfileGridProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'brand' | 'space'>('brand');
  const [brandPublicFilter, setBrandPublicFilter] = useState<BrandPublicFilter>('all');
  const [loading, setLoading] = useState(true);
  const [brandItems, setBrandItems] = useState<GridItem[]>([]);
  const [spaceItems, setSpaceItems] = useState<GridItem[]>([]);
  const [productItems, setProductItems] = useState<GridItem[]>([]);
  const [eventItems, setEventItems] = useState<GridItem[]>([]);
  const [brandCount, setBrandCount] = useState(0);
  const [spaceCount, setSpaceCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [eventsCount, setEventsCount] = useState(0);

  useEffect(() => {
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, orgSlug, mode, tabVariant]);

  useEffect(() => {
    if (tabVariant === 'brand_public') {
      if (brandPublicFilter === 'all') {
        loadBrandItems();
      } else if (brandPublicFilter === 'products') {
        loadProductItemsOnly();
      } else {
        loadEventItemsOnly();
      }
    } else {
      if (activeTab === 'brand') {
        loadBrandItems();
      } else {
        loadSpaceItems();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, brandPublicFilter, tabVariant, orgId, orgSlug, mode]);

  const loadCounts = async () => {
    try {
      // Products count - exclude addons when brand_public
      let productsQuery = supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId);
      if (tabVariant === 'brand_public') {
        productsQuery = productsQuery.eq('type', 'physical');
      }

      // Fetch total counts for brand items (products + events)
      const [productsCountResult, eventsCountResult, spacesCountResult] = await Promise.all([
        productsQuery,
        mode === 'public'
          ? supabase
              .from('events')
              .select('*', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .eq('status', 'published')
          : supabase
              .from('events')
              .select('*', { count: 'exact', head: true })
              .eq('org_id', orgId),
        supabase
          .from('poster_spaces')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'published'),
      ]);

      const productsCountVal = productsCountResult.count || 0;
      const eventsCountVal = eventsCountResult.count || 0;
      const spacesCount = spacesCountResult.count || 0;

      setBrandCount(productsCountVal + eventsCountVal);
      setSpaceCount(spacesCount);
      setProductsCount(productsCountVal);
      setEventsCount(eventsCountVal);
    } catch (error: any) {
      console.error('Error loading counts:', error);
    }
  };

  const loadBrandItems = async () => {
    try {
      setLoading(true);

      let productsQuery = supabase
        .from('products')
        .select('id, title, metadata, image_url, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(60);
      if (tabVariant === 'brand_public') {
        productsQuery = productsQuery.eq('type', 'physical');
      }

      // Fetch products and events in parallel
      const [productsResult, eventsResult] = await Promise.all([
        productsQuery,
        mode === 'public'
          ? supabase
              .from('events')
              .select('id, title, slug, instagram_preview_image_url, metadata, created_at')
              .eq('org_id', orgId)
              .eq('status', 'published')
              .order('created_at', { ascending: false })
              .limit(60)
          : supabase
              .from('events')
              .select('id, title, slug, instagram_preview_image_url, metadata, created_at')
              .eq('org_id', orgId)
              .order('created_at', { ascending: false })
              .limit(60),
      ]);

      const products = (productsResult.data || []) as any[];
      const events = (eventsResult.data || []) as any[];

      // Transform products - prefer image_url (photo upload/URL), fallback to metadata
      const productItems: GridItem[] = products.map((p) => {
        let imageUrl: string | null = p.image_url || null;
        if (!imageUrl && p.metadata?.photos?.[0]) imageUrl = p.metadata.photos[0];
        else if (!imageUrl && p.metadata?.image) imageUrl = p.metadata.image;

        return {
          id: p.id,
          type: 'product' as const,
          title: p.title,
          imageUrl,
          orgSlug: orgSlug || undefined,
          created_at: p.created_at,
        };
      });

      // Transform events
      const eventItems: GridItem[] = events.map((e) => {
        // Use instagram_preview_image_url or metadata image
        let imageUrl: string | null = e.instagram_preview_image_url || null;
        if (!imageUrl && e.metadata?.image) {
          imageUrl = e.metadata.image;
        }

        return {
          id: e.id,
          type: 'event' as const,
          title: e.title,
          imageUrl,
          slug: e.slug,
          orgSlug: orgSlug || undefined,
          created_at: e.created_at,
        };
      });

      // Merge and sort by created_at desc
      const merged = [...productItems, ...eventItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setBrandItems(merged);
    } catch (error: any) {
      console.error('Error loading brand items:', error);
      toast.error('Failed to load brand items');
    } finally {
      setLoading(false);
    }
  };

  const loadSpaceItems = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('poster_spaces')
        .select('id, short_code, title, photos, created_at')
        .eq('org_id', orgId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;

      const spaces = (data || []) as PosterSpace[];

      const items: GridItem[] = spaces.map((s) => ({
        id: s.id,
        type: 'space' as const,
        title: s.title,
        imageUrl: s.photos && s.photos.length > 0 ? s.photos[0] : null,
        shortCode: s.short_code,
        orgSlug: orgSlug || undefined,
        created_at: s.created_at,
      }));

      setSpaceItems(items);
    } catch (error: any) {
      console.error('Error loading space items:', error);
      toast.error('Failed to load spaces');
    } finally {
      setLoading(false);
    }
  };

  const loadProductItemsOnly = async () => {
    try {
      setLoading(true);
      const { data: products, error } = await supabase
        .from('products')
        .select('id, title, metadata, image_url, created_at')
        .eq('org_id', orgId)
        .eq('type', 'physical')
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;

      const items: GridItem[] = (products || []).map((p: any) => {
        let imageUrl: string | null = p.image_url || null;
        if (!imageUrl && p.metadata?.photos?.[0]) imageUrl = p.metadata.photos[0];
        else if (!imageUrl && p.metadata?.image) imageUrl = p.metadata.image;
        return {
          id: p.id,
          type: 'product' as const,
          title: p.title,
          imageUrl,
          orgSlug: orgSlug || undefined,
          created_at: p.created_at,
        };
      });
      setProductItems(items);
    } catch (error: any) {
      console.error('Error loading products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const loadEventItemsOnly = async () => {
    try {
      setLoading(true);
      const query = supabase
        .from('events')
        .select('id, title, slug, instagram_preview_image_url, metadata, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(60);
      const { data: events, error } = mode === 'public'
        ? await query.eq('status', 'published')
        : await query;

      if (error) throw error;

      const items: GridItem[] = (events || []).map((e: any) => {
        let imageUrl: string | null = e.instagram_preview_image_url || null;
        if (!imageUrl && e.metadata?.image) imageUrl = e.metadata.image;
        return {
          id: e.id,
          type: 'event' as const,
          title: e.title,
          imageUrl,
          slug: e.slug,
          orgSlug: orgSlug || undefined,
          created_at: e.created_at,
        };
      });
      setEventItems(items);
    } catch (error: any) {
      console.error('Error loading events:', error);
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item: GridItem) => {
    if (item.type === 'space' && item.shortCode) {
      // Navigate to space detail
      if (item.orgSlug) {
        navigate(`/space/${item.shortCode}-${item.orgSlug}`);
      } else {
        navigate(`/space/${item.shortCode}`);
      }
    } else if (item.type === 'event' && item.slug && item.orgSlug) {
      // Navigate to event detail
      navigate(`/${item.orgSlug}/${item.slug}`);
    } else if (item.type === 'product') {
      if (item.orgSlug) {
        navigate(`/${item.orgSlug}/products/${item.id}`);
      } else {
        toast.info('Product detail page coming soon');
      }
    } else {
      toast.info('Detail page coming soon');
    }
  };

  const renderGrid = (items: GridItem[]) => {
    if (loading) {
      return (
        <div className="grid grid-cols-3 gap-1 md:gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No items yet</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-1 md:gap-2">
        {items.map((item) => (
          <button
            key={`${item.type}-${item.id}`}
            onClick={() => handleItemClick(item)}
            className="aspect-square w-full relative overflow-hidden rounded-sm bg-muted hover:opacity-90 transition-opacity"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <span className="text-xs text-muted-foreground">No image</span>
              </div>
            )}
          </button>
        ))}
      </div>
    );
  };

  const getBrandPublicItems = () => {
    if (brandPublicFilter === 'all') return brandItems;
    if (brandPublicFilter === 'products') return productItems;
    return eventItems;
  };

  if (tabVariant === 'brand_public') {
    return (
      <div className="w-full">
        <div className="flex flex-wrap gap-2 mb-4">
          {(['all', 'products', 'events'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setBrandPublicFilter(filter)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                brandPublicFilter === filter
                  ? 'bg-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
              style={
                brandPublicFilter === filter
                  ? { backgroundColor: '#0F1F17', color: '#FBF8F4' }
                  : {}
              }
            >
              {filter === 'all' && `All (${brandCount})`}
              {filter === 'products' && `Products (${productsCount})`}
              {filter === 'events' && `Events (${eventsCount})`}
            </button>
          ))}
        </div>
        {renderGrid(getBrandPublicItems())}
      </div>
    );
  }

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'brand' | 'space')}>
        <TabsList className="w-full justify-center mb-4 bg-transparent" style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.1)' }}>
          <TabsTrigger 
            value="brand" 
            className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none"
            style={{ 
              borderBottomColor: activeTab === 'brand' ? '#0F1F17' : 'transparent',
              borderRadius: 0
            }}
          >
            Brand({brandCount})
          </TabsTrigger>
          <TabsTrigger 
            value="space"
            className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none"
            style={{ 
              borderBottomColor: activeTab === 'space' ? '#0F1F17' : 'transparent',
              borderRadius: 0
            }}
          >
            Space({spaceCount})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="brand" className="mt-0">
          {renderGrid(brandItems)}
        </TabsContent>
        
        <TabsContent value="space" className="mt-0">
          {renderGrid(spaceItems)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

