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

export interface ProfileGridProps {
  orgId: string;
  orgSlug?: string | null;
  mode: 'owner' | 'public';
}

export default function ProfileGrid({ orgId, orgSlug, mode }: ProfileGridProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'brand' | 'space'>('brand');
  const [loading, setLoading] = useState(true);
  const [brandItems, setBrandItems] = useState<GridItem[]>([]);
  const [spaceItems, setSpaceItems] = useState<GridItem[]>([]);

  useEffect(() => {
    if (activeTab === 'brand') {
      loadBrandItems();
    } else {
      loadSpaceItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, orgId, orgSlug, mode]);

  const loadBrandItems = async () => {
    try {
      setLoading(true);
      
      // Fetch products and events in parallel
      const [productsResult, eventsResult] = await Promise.all([
        supabase
          .from('products')
          .select('id, title, metadata, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(60),
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

      // Transform products
      const productItems: GridItem[] = products.map((p) => {
        // Extract first image from metadata.photos or metadata.image
        let imageUrl: string | null = null;
        if (p.metadata?.photos && Array.isArray(p.metadata.photos) && p.metadata.photos.length > 0) {
          imageUrl = p.metadata.photos[0];
        } else if (p.metadata?.image) {
          imageUrl = p.metadata.image;
        }

        return {
          id: p.id,
          type: 'product' as const,
          title: p.title,
          imageUrl,
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
      // For now, just show toast - product detail pages may not exist yet
      toast.info('Product detail page coming soon');
      // If product detail route exists, uncomment:
      // navigate(`/app/products/${item.id}/edit`);
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

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'brand' | 'space')}>
        <TabsList className="w-full justify-start mb-4 bg-transparent" style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.1)' }}>
          <TabsTrigger 
            value="brand" 
            className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none"
            style={{ 
              borderBottomColor: activeTab === 'brand' ? '#0F1F17' : 'transparent',
              borderRadius: 0
            }}
          >
            Brand
          </TabsTrigger>
          <TabsTrigger 
            value="space"
            className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none"
            style={{ 
              borderBottomColor: activeTab === 'space' ? '#0F1F17' : 'transparent',
              borderRadius: 0
            }}
          >
            Space
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

