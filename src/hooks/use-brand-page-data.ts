import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BrandEvent {
  id: string;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  orgSlug: string | null;
  dateStrings: string[];
  priceFrom: number | null;
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
            .select('id, title, slug, start_at, day_2_start_at, instagram_preview_image_url, metadata')
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

        const eventIds = eventsData.map((e) => e.id);
        let minPriceByEvent: Record<string, number> = {};
        if (eventIds.length > 0) {
          const { data: ticketTypes } = await supabase
            .from('ticket_types')
            .select('event_id, price')
            .in('event_id', eventIds)
            .eq('is_active', true)
            .eq('visibility_mode', 'public');
          (ticketTypes || []).forEach((tt: { event_id: string; price: number }) => {
            const current = minPriceByEvent[tt.event_id];
            if (current == null || tt.price < current) {
              minPriceByEvent[tt.event_id] = tt.price;
            }
          });
        }

        setEvents(
          eventsData.map((e) => {
            let imageUrl = e.instagram_preview_image_url || null;
            if (!imageUrl && e.metadata?.image) imageUrl = e.metadata.image;
            const dateStrings: string[] = [];
            if (e.start_at) dateStrings.push(e.start_at);
            if (e.day_2_start_at) dateStrings.push(e.day_2_start_at);
            return {
              id: e.id,
              title: e.title,
              slug: e.slug,
              imageUrl,
              orgSlug,
              dateStrings,
              priceFrom: minPriceByEvent[e.id] ?? null,
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
