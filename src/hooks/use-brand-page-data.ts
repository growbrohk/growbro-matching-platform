import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sortByManualDisplayOrder } from '@/lib/utils/product-display-order';

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

        // Collab: host events/products the partner may show on this public brand page
        const { data: collabRows, error: collabRpcError } = await supabase.rpc(
          'get_collab_brand_page_items',
          { p_affiliate_org_id: orgId },
        );
        if (collabRpcError) {
          console.error('get_collab_brand_page_items', collabRpcError);
        }
        type CollabBrandRow = {
          kind: string;
          item_id: string;
          host_org_slug: string | null;
        };
        const collabList = (collabRows || []) as CollabBrandRow[];

        const ownedEventIds = new Set(eventsData.map((e) => e.id as string));
        const ownedProductIds = new Set(productsData.map((p) => p.id as string));

        const extraEventPairs: { id: string; hostSlug: string }[] = [];
        const extraProductPairs: { id: string; hostSlug: string }[] = [];
        for (const row of collabList) {
          const hid = row.host_org_slug;
          if (!row.item_id || !hid) continue;
          if (row.kind === 'event' && !ownedEventIds.has(row.item_id)) {
            extraEventPairs.push({ id: row.item_id, hostSlug: hid });
            ownedEventIds.add(row.item_id);
          } else if (row.kind === 'product' && !ownedProductIds.has(row.item_id)) {
            extraProductPairs.push({ id: row.item_id, hostSlug: hid });
            ownedProductIds.add(row.item_id);
          }
        }

        if (extraEventPairs.length > 0) {
          const ids = extraEventPairs.map((x) => x.id);
          const slugById = new Map(extraEventPairs.map((x) => [x.id, x.hostSlug]));
          const { data: extraEvents } = await supabase
            .from('events')
            .select(
              'id, title, slug, start_at, day_2_start_at, end_at, day_2_end_at, created_at, instagram_preview_image_url, metadata',
            )
            .in('id', ids)
            .eq('status', 'published');
          for (const e of extraEvents || []) {
            (e as any).brand_page_org_slug = slugById.get(e.id as string) ?? null;
            eventsData.push(e);
          }
        }

        if (extraProductPairs.length > 0) {
          const ids = extraProductPairs.map((x) => x.id);
          const slugById = new Map(extraProductPairs.map((x) => [x.id, x.hostSlug]));
          let extraPQ = supabase
            .from('products')
            .select('id, title, image_url, metadata, base_price, created_at')
            .in('id', ids)
            .eq('type', 'physical');
          if (productsFilter === 'in_sale_only') {
            extraPQ = extraPQ.eq('is_on_sale', true);
          }
          const { data: extraProducts } = await extraPQ;
          for (const p of extraProducts || []) {
            (p as any).brand_page_org_slug = slugById.get(p.id as string) ?? null;
            productsData.push(p);
          }
        }

        if (eventsSort === 'date') {
          eventsData = [...eventsData].sort(
            (a, b) =>
              new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
          );
        } else if (eventsSort === 'creation') {
          eventsData = [...eventsData].sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
        }

        if (productsSort === 'date' || productsSort === 'creation') {
          productsData = [...productsData].sort((a, b) => {
            const at = new Date(a.created_at).getTime();
            const bt = new Date(b.created_at).getTime();
            return productsSort === 'date' ? at - bt : bt - at;
          });
        }

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
          productsData = sortByManualDisplayOrder(productsData, productsDisplayOrder);
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
            const rowSlug = (e as { brand_page_org_slug?: string | null }).brand_page_org_slug;
            return {
              id: e.id,
              title: e.title,
              slug: e.slug,
              imageUrl,
              orgSlug: rowSlug ?? orgSlug,
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
            const rowSlug = (p as { brand_page_org_slug?: string | null }).brand_page_org_slug;
            return {
              id: p.id,
              title: p.title,
              imageUrl,
              orgSlug: rowSlug ?? orgSlug,
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
