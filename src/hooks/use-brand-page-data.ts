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

export interface BrandPageProfileConfig {
  events_filter?: 'all' | 'non_expired';
  events_sort?: 'manual' | 'random' | 'date' | 'creation';
  events_display_order?: string[];
  products_filter?: 'all' | 'in_sale_only';
  products_sort?: 'manual' | 'random' | 'date' | 'creation';
  products_display_order?: string[];
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function useBrandPageData(orgId: string, orgSlug: string | null, profile?: BrandPageProfileConfig | null) {
  const [events, setEvents] = useState<BrandEvent[]>([]);
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const eventsFilter = profile?.events_filter ?? 'all';
  const eventsSort = profile?.events_sort ?? 'creation';
  const eventsDisplayOrder = profile?.events_display_order ?? [];
  const productsFilter = profile?.products_filter ?? 'all';
  const productsSort = profile?.products_sort ?? 'creation';
  const productsDisplayOrder = profile?.products_display_order ?? [];

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);

        let eventsQuery = supabase
          .from('events')
          .select('id, title, slug, start_at, day_2_start_at, end_at, day_2_end_at, created_at, instagram_preview_image_url, metadata')
          .eq('org_id', orgId)
          .eq('status', 'published');

        if (eventsSort === 'date') {
          eventsQuery = eventsQuery.order('start_at', { ascending: true });
        } else if (eventsSort === 'creation') {
          eventsQuery = eventsQuery.order('created_at', { ascending: false });
        } else {
          eventsQuery = eventsQuery.order('created_at', { ascending: false });
        }
        eventsQuery = eventsQuery.limit(50);

        let productsQuery = supabase
          .from('products')
          .select('id, title, image_url, metadata, base_price, created_at')
          .eq('org_id', orgId)
          .eq('type', 'physical');

        if (productsFilter === 'in_sale_only') {
          productsQuery = productsQuery.eq('is_on_sale', true);
        }
        if (productsSort === 'date' || productsSort === 'creation') {
          productsQuery = productsQuery.order('created_at', { ascending: productsSort === 'date' });
        } else {
          productsQuery = productsQuery.order('created_at', { ascending: false });
        }
        productsQuery = productsQuery.limit(50);

        const [eventsRes, productsRes] = await Promise.all([eventsQuery, productsQuery]);

        let eventsData = (eventsRes.data || []) as any[];
        let productsData = (productsRes.data || []) as any[];

        if (eventsFilter === 'non_expired') {
          eventsData = eventsData.filter((e) => {
            const latestEnd = e.day_2_end_at || e.end_at;
            return latestEnd && new Date(latestEnd) >= new Date();
          });
        }

        if (eventsSort === 'manual' && eventsDisplayOrder.length > 0) {
          const ordered = eventsDisplayOrder.filter((id) => eventsData.some((e) => e.id === id));
          const orderMap = new Map(ordered.map((id, i) => [id, i]));
          eventsData = [...eventsData].sort((a, b) => {
            const ai = orderMap.get(a.id) ?? 9999;
            const bi = orderMap.get(b.id) ?? 9999;
            return ai - bi;
          });
        } else if (eventsSort === 'random') {
          eventsData = shuffle(eventsData);
        }

        if (productsSort === 'manual' && productsDisplayOrder.length > 0) {
          const orderSet = new Set(productsDisplayOrder);
          const ordered = productsDisplayOrder.filter((id) => productsData.some((p) => p.id === id));
          const orderMap = new Map(ordered.map((id, i) => [id, i]));
          productsData = [...productsData].sort((a, b) => {
            const ai = orderMap.get(a.id) ?? 9999;
            const bi = orderMap.get(b.id) ?? 9999;
            return ai - bi;
          });
        } else if (productsSort === 'random') {
          productsData = shuffle(productsData);
        }

        eventsData = eventsData.slice(0, 20);
        productsData = productsData.slice(0, 20);

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
  }, [orgId, orgSlug, eventsFilter, eventsSort, JSON.stringify(eventsDisplayOrder), productsFilter, productsSort, JSON.stringify(productsDisplayOrder)]);

  return { events, products, loading };
}
