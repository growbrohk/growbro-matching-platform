import { supabase } from '@/integrations/supabase/client';
import {
  buildCollabColumnsForTrackingLink,
  defaultPartnerPipelineValues,
  type PartnerPipelineValues,
  type PartnerPipelineType,
  type CommissionBasis,
} from '@/components/tracking/PartnerPipelineFields';

export type ProductPartnerLinkStatus = 'active' | 'inactive' | 'pending';

export interface ProductPartnerDraft {
  localId: string;
  trackingLinkId?: string;
  affiliateOrgName?: string;
  status: ProductPartnerLinkStatus;
  deleted?: boolean;
  partner: PartnerPipelineValues;
}

function nullCollabColumns(): Record<string, null> {
  return {
    collab_sales_scope: null,
    collab_partner_role: null,
    collab_can_view_order_details: null,
    collab_can_mark_shipped: null,
    collab_show_event_in_partner_events_tab: null,
    collab_partner_allow_edit_tab: null,
    collab_partner_allow_tickets_tab: null,
    collab_partner_allow_scan_tab: null,
    collab_show_on_partner_public_profile: null,
  };
}

function rowToPartnerValues(row: Record<string, unknown>): PartnerPipelineValues {
  const cr = row.commission_rate as number | null;
  const sd = row.start_date as string | null;
  const ed = row.end_date as string | null;
  const basis = row.commission_basis as string | null;
  return {
    pipelineType: (row.type === 'affiliate' ? 'affiliate' : 'collab') as PartnerPipelineType,
    affiliateOrgId: (row.affiliate_org_id as string) || undefined,
    startDate: sd ? sd.slice(0, 10) : '',
    endDate: ed ? ed.slice(0, 10) : '',
    commissionRate: cr != null ? String(Number(cr) * 100) : '',
    commissionBasis: basis === 'profit' ? 'profit' : 'revenue',
    collabSalesScope: (row.collab_sales_scope as 'attributed' | 'all_for_resource') || 'attributed',
    collabPartnerRole: (row.collab_partner_role as 'viewer' | 'editor') || 'viewer',
    collabCanViewDetails: row.collab_can_view_order_details === true,
    collabCanMarkShipped: row.collab_can_mark_shipped === true,
    collabShowInPartnerEventsTab: row.collab_show_event_in_partner_events_tab !== false,
    collabAllowEditTab: row.collab_partner_allow_edit_tab === true,
    collabAllowTicketsTab: row.collab_partner_allow_tickets_tab !== false,
    collabAllowScanTab: row.collab_partner_allow_scan_tab === true,
    collabShowOnPartnerPublicProfile: row.collab_show_on_partner_public_profile !== false,
  };
}

export async function loadProductPartners(
  productId: string,
  hostOrgId: string
): Promise<ProductPartnerDraft[]> {
  const { data: links, error } = await supabase
    .from('tracking_links')
    .select('*')
    .eq('product_id', productId)
    .eq('host_org_id', hostOrgId)
    .in('type', ['affiliate', 'collab'])
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!links?.length) return [];

  const affiliateIds = [
    ...new Set(
      links.map((l) => l.affiliate_org_id).filter((id): id is string => !!id)
    ),
  ];
  const nameMap = new Map<string, string>();
  if (affiliateIds.length > 0) {
    const { data: orgs } = await supabase.from('orgs').select('id, name').in('id', affiliateIds);
    (orgs || []).forEach((o) => nameMap.set(o.id, o.name));
  }

  return links.map((row) => ({
    localId: row.id,
    trackingLinkId: row.id,
    affiliateOrgName: row.affiliate_org_id ? nameMap.get(row.affiliate_org_id) : undefined,
    status: (row.status as ProductPartnerLinkStatus) || 'pending',
    partner: rowToPartnerValues(row as Record<string, unknown>),
  }));
}

async function generateSlug(baseText: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_tracking_slug', { base_text: baseText });
  if (error) throw error;
  if (!data) throw new Error('Failed to generate slug');
  return data as string;
}

function buildPartnerPayload(
  values: PartnerPipelineValues,
  productId: string,
  destinationUrl: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: values.pipelineType,
    destination_type: 'product',
    destination_url: destinationUrl,
    product_id: productId,
    event_id: null,
    affiliate_org_id: values.affiliateOrgId,
    commission_rate: parseFloat(values.commissionRate) / 100,
    commission_basis: values.commissionBasis,
    start_date: values.startDate,
    end_date: values.endDate,
    ...nullCollabColumns(),
  };

  if (values.pipelineType === 'collab') {
    Object.assign(
      payload,
      buildCollabColumnsForTrackingLink(values, {
        destinationType: 'product',
        hasEvent: false,
        hasProduct: true,
      })
    );
  }

  return payload;
}

export function validateProductPartners(
  enabled: boolean,
  partners: ProductPartnerDraft[]
): string | null {
  if (!enabled) return null;

  const active = partners.filter((p) => !p.deleted);
  if (active.length === 0) return 'Add at least one partner or disable the collab section.';

  const orgIds = new Set<string>();
  for (const p of active) {
    const v = p.partner;
    if (!v.affiliateOrgId) return 'Each partner must have an organization selected.';
    if (orgIds.has(v.affiliateOrgId)) return 'Each partner organization can only be added once.';
    orgIds.add(v.affiliateOrgId);
    if (!v.startDate || !v.endDate) return 'Start and end dates are required for each partner.';
    if (!v.commissionRate || Number.isNaN(parseFloat(v.commissionRate))) {
      return 'Commission rate is required for each partner.';
    }
  }
  return null;
}

export async function syncProductPartners(opts: {
  productId: string;
  productTitle: string;
  hostOrgId: string;
  hostOrgSlug: string | null;
  enabled: boolean;
  partners: ProductPartnerDraft[];
}): Promise<void> {
  const { productId, productTitle, hostOrgId, hostOrgSlug, enabled, partners } = opts;

  if (!enabled) {
    const { data: existingLinks, error: listErr } = await supabase
      .from('tracking_links')
      .select('id')
      .eq('product_id', productId)
      .eq('host_org_id', hostOrgId)
      .in('type', ['affiliate', 'collab']);
    if (listErr) throw listErr;
    for (const row of existingLinks || []) {
      const { error } = await supabase.from('tracking_links').delete().eq('id', row.id);
      if (error) throw error;
    }
    return;
  }

  const destinationUrl = hostOrgSlug
    ? `/${hostOrgSlug}/products/${productId}`
    : `/products/${productId}`;

  for (const draft of partners) {
    if (draft.deleted && draft.trackingLinkId) {
      const { error } = await supabase.from('tracking_links').delete().eq('id', draft.trackingLinkId);
      if (error) throw error;
      continue;
    }
    if (draft.deleted) continue;

    const label =
      draft.affiliateOrgName && productTitle
        ? `${productTitle} – ${draft.affiliateOrgName}`
        : productTitle || 'Product partner';

    if (draft.trackingLinkId) {
      const updatePayload = {
        ...buildPartnerPayload(draft.partner, productId, destinationUrl),
        label,
        status: draft.status,
        host_org_id: hostOrgId,
      };
      const { error } = await supabase
        .from('tracking_links')
        .update(updatePayload)
        .eq('id', draft.trackingLinkId);
      if (error) throw error;
    } else {
      const slug = await generateSlug(label);
      const insertPayload = {
        slug,
        label,
        host_org_id: hostOrgId,
        status: 'pending' as const,
        ...buildPartnerPayload(draft.partner, productId, destinationUrl),
      };
      const { data: created, error } = await supabase
        .from('tracking_links')
        .insert(insertPayload)
        .select('id')
        .single();
      if (error) throw error;

      const { error: reqErr } = await supabase.from('affiliate_requests').insert({
        tracking_link_id: created.id,
        host_org_id: hostOrgId,
        affiliate_org_id: draft.partner.affiliateOrgId!,
        status: 'pending',
      });
      if (reqErr) {
        console.error('affiliate_requests insert', reqErr);
      }
    }
  }
}

export function createEmptyProductPartnerDraft(): ProductPartnerDraft {
  return {
    localId: crypto.randomUUID(),
    status: 'pending',
    partner: defaultPartnerPipelineValues(),
  };
}
