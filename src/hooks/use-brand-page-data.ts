import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BrandEvent {
  id: string;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  orgSlug: string | null;
}

export interface BrandProduct {
  id: string;
  title: string;
  imageUrl: string | null;
  orgSlug: string | null;
  price: number;
}

export function useBrandPageData(orgId: string, orgSlug: string | null) {
  const [events, setEvents] = useState<BrandEvent[]>([]);
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const [eventsRes, productsRes] = await Promise.all([
          supabase
            .from('events')
            .select('id, title, slug, instagram_preview_image_url, metadata')
            .eq('org_id', orgId)
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('products')
            .select('id, title, image_url, metadata, base_price')
            .eq('org_id', orgId)
            .eq('type', 'physical')
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        const eventsData = (eventsRes.data || []) as any[];
        const productsData = (productsRes.data || []) as any[];

        setEvents(
          eventsData.map((e) => {
            let imageUrl = e.instagram_preview_image_url || null;
            if (!imageUrl && e.metadata?.image) imageUrl = e.metadata.image;
            return {
              id: e.id,
              title: e.title,
              slug: e.slug,
              imageUrl,
              orgSlug,
            };
          })
        );

        setProducts(
          productsData.map((p) => {
            let imageUrl = p.image_url || null;
            if (!imageUrl && p.metadata?.photos?.[0]) imageUrl = p.metadata.photos[0];
            else if (!imageUrl && p.metadata?.image) imageUrl = p.metadata.image;
            return {
              id: p.id,
              title: p.title,
              imageUrl,
              orgSlug,
              price: Number(p.base_price) || 0,
            };
          })
        );
      } catch (err) {
        console.error('Error loading brand page data:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orgId, orgSlug]);

  return { events, products, loading };
}
