import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchHostOrderDetail } from '@/lib/api/host-order-detail';
import { formatMoney } from '@/hooks/useOrdersDashboard';
import { format } from 'date-fns';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { OrderWithEvent, TicketTypeAccessVariantSnapshot } from '@/lib/api/bookings';
import type { OrderWithOrgAndProducts } from '@/lib/api/product-checkout';
import { collabPartnerCanViewOrderDetails } from '@/lib/collab-order-access';

const TEXT = '#0F1F17';
const MUTED = 'rgba(15,31,23,0.6)';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide mt-6 mb-2" style={{ color: MUTED }}>
      {children}
    </h2>
  );
}

function getPaymentProofRef(
  receiptUrl: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const raw =
    (typeof receiptUrl === 'string' && receiptUrl) ||
    (metadata && typeof metadata.payment_proof_path === 'string' && metadata.payment_proof_path) ||
    (metadata && typeof metadata.payment_proof_url === 'string' && metadata.payment_proof_url) ||
    null;

  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('payment-receipts/')) return raw.replace(/^payment-receipts\//, '');
  return raw;
}

function formatDeliveryMethod(method: unknown): string {
  const m = typeof method === 'string' ? method : '';
  switch (m) {
    case 'door':
      return 'Home / office delivery';
    case 'sf_locker':
      return 'SF Locker';
    case 'event_pickup':
      return 'Event pickup';
    default:
      return m || '—';
  }
}

function keyLabel(k: string): string {
  return k.replace(/_/g, ' ');
}

function DeliveryDetailsRows({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([, v]) => v != null && String(v).trim() !== '');
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-2 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5">
          <dt className="capitalize" style={{ color: MUTED }}>
            {keyLabel(k)}
          </dt>
          <dd style={{ color: TEXT }}>{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function AccessVariantSummary({ v }: { v: TicketTypeAccessVariantSnapshot }) {
  const parts = [v.visibility_mode];
  if (v.access_code) parts.push(`code: ${v.access_code}`);
  if (v.price_override != null) parts.push(`override ${v.price_override}`);
  if (v.discount_percent != null) parts.push(`${v.discount_percent}% off`);
  return <span className="text-sm">{parts.filter(Boolean).join(' · ')}</span>;
}

function ProductPromoVariantSummary({
  v,
}: {
  v: NonNullable<OrderWithOrgAndProducts['order_items'][number]['product_access_variant']>;
}) {
  const parts = [v.visibility_mode];
  if (v.access_code) parts.push(`code: ${v.access_code}`);
  if (v.price_override != null) parts.push(`override ${v.price_override}`);
  if (v.discount_percent != null) parts.push(`${v.discount_percent}% off`);
  return <span className="text-sm">{parts.filter(Boolean).join(' · ')}</span>;
}

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const [open, setOpen] = useState(false);
  let text = '';
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-gray-200 rounded-lg overflow-hidden">
      <CollapsibleTrigger
        className="w-full text-left px-3 py-2 text-sm font-medium bg-gray-50 hover:bg-gray-100"
        style={{ color: TEXT }}
      >
        {open ? '▼' : '▶'} {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="text-xs p-3 overflow-x-auto max-h-64 overflow-y-auto bg-white border-t border-gray-100 whitespace-pre-wrap break-all">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProductDetailBody({
  data,
  proofRef,
  onOpenProof,
}: {
  data: OrderWithOrgAndProducts;
  proofRef: string | null;
  onOpenProof: () => void;
}) {
  const o = data.order;
  const meta = (o.metadata || {}) as Record<string, unknown>;
  const deliveryMethod = formatDeliveryMethod(meta.delivery_method);
  const deliveryDetails =
    meta.delivery_details && typeof meta.delivery_details === 'object' && !Array.isArray(meta.delivery_details)
      ? (meta.delivery_details as Record<string, unknown>)
      : null;

  const shippingRows: [string, unknown][] = [
    ['items_subtotal', meta.items_subtotal],
    ['shipping_weight_kg', meta.shipping_weight_kg],
    ['shipping_rate_per_kg', meta.shipping_rate_per_kg],
    ['shipping_fee', meta.shipping_fee],
  ].filter(([, v]) => v != null && v !== '');

  return (
    <>
      <SectionTitle>Order summary</SectionTitle>
      <div className="space-y-1 text-sm" style={{ color: TEXT }}>
        {o.order_no && (
          <p>
            <span style={{ color: MUTED }}>Order no. </span>
            {o.order_no}
          </p>
        )}
        <p>
          <span style={{ color: MUTED }}>Placed </span>
          {o.created_at ? format(new Date(o.created_at), 'MMM d, yyyy h:mm a') : '—'}
        </p>
        <p>
          <span style={{ color: MUTED }}>Payment </span>
          {o.payment_status ?? '—'}
          {o.payment_method ? ` · ${o.payment_method}` : ''}
        </p>
        <p>
          <span style={{ color: MUTED }}>Fulfillment </span>
          {o.fulfillment_status ?? '—'}
        </p>
        <p className="font-medium">Total {formatMoney(Number(o.total_amount))}</p>
      </div>

      <SectionTitle>Buyer</SectionTitle>
      <div className="text-sm space-y-1" style={{ color: TEXT }}>
        <p>{[o.buyer_first_name, o.buyer_last_name].filter(Boolean).join(' ') || '—'}</p>
        {o.buyer_email && <p>{o.buyer_email}</p>}
        {o.buyer_phone && <p>{o.buyer_phone}</p>}
      </div>

      <SectionTitle>Delivery</SectionTitle>
      <div className="text-sm space-y-2" style={{ color: TEXT }}>
        <p>
          <span style={{ color: MUTED }}>Method </span>
          {deliveryMethod}
        </p>
        {deliveryDetails && <DeliveryDetailsRows details={deliveryDetails} />}
        {shippingRows.length > 0 && (
          <dl className="grid grid-cols-1 gap-1">
            {shippingRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt style={{ color: MUTED }}>{keyLabel(k)}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <SectionTitle>Line items</SectionTitle>
      <ul className="space-y-3">
        {data.order_items.map((item) => (
          <li key={item.id} className="border-b border-gray-100 pb-3 text-sm last:border-0">
            <div className="font-medium" style={{ color: TEXT }}>
              {item.product_name}
              {item.variant_label ? ` — ${item.variant_label}` : ''}
            </div>
            <div style={{ color: MUTED }}>
              Qty {item.quantity} × {formatMoney(item.unit_price)} = {formatMoney(item.subtotal)}
            </div>
            {item.product_access_variant && (
              <div className="mt-1 pl-2 border-l-2 border-gray-200">
                <span style={{ color: MUTED }} className="text-xs uppercase">
                  Promo link
                </span>
                <ProductPromoVariantSummary v={item.product_access_variant} />
              </div>
            )}
            {item.metadata && Object.keys(item.metadata).length > 0 && (
              <div className="mt-2">
                <JsonBlock value={item.metadata} label="Item metadata" />
              </div>
            )}
          </li>
        ))}
      </ul>

      {proofRef && (
        <>
          <SectionTitle>Payment proof</SectionTitle>
          <button
            type="button"
            className="text-sm underline"
            style={{ color: TEXT }}
            onClick={onOpenProof}
          >
            View receipt / proof
          </button>
        </>
      )}

      <SectionTitle>Raw metadata</SectionTitle>
      <JsonBlock value={meta} label="order.metadata (JSON)" />

      <div className="mt-4">
        <JsonBlock value={data} label="Full product order payload (JSON)" />
      </div>
    </>
  );
}

function EventDetailBody({
  data,
  proofRef,
  onOpenProof,
}: {
  data: OrderWithEvent;
  proofRef: string | null;
  onOpenProof: () => void;
}) {
  const o = data;
  const meta = o.metadata || {};

  return (
    <>
      <SectionTitle>Order summary</SectionTitle>
      <div className="space-y-1 text-sm" style={{ color: TEXT }}>
        <p className="font-medium">{data.event.title}</p>
        {o.order_no && (
          <p>
            <span style={{ color: MUTED }}>Order no. </span>
            {o.order_no}
          </p>
        )}
        <p>
          <span style={{ color: MUTED }}>Placed </span>
          {o.created_at ? format(new Date(o.created_at), 'MMM d, yyyy h:mm a') : '—'}
        </p>
        <p>
          <span style={{ color: MUTED }}>Payment </span>
          {o.payment_status ?? '—'}
          {o.payment_method ? ` · ${o.payment_method}` : ''}
        </p>
        <p>
          <span style={{ color: MUTED }}>Fulfillment </span>
          {o.fulfillment_status ?? '—'}
        </p>
        <p className="font-medium">Total {formatMoney(Number(o.total_amount))}</p>
      </div>

      <SectionTitle>Buyer</SectionTitle>
      <div className="text-sm space-y-1" style={{ color: TEXT }}>
        <p>{[o.buyer_first_name, o.buyer_last_name].filter(Boolean).join(' ') || '—'}</p>
        {o.buyer_email && <p>{o.buyer_email}</p>}
        {o.buyer_phone && <p>{o.buyer_phone}</p>}
      </div>

      <SectionTitle>Ticket lines</SectionTitle>
      <ul className="space-y-3">
        {data.order_items.map((item) => (
          <li key={item.id} className="border-b border-gray-100 pb-3 text-sm last:border-0">
            <div className="font-medium" style={{ color: TEXT }}>
              {item.ticket_type.name}
            </div>
            <div style={{ color: MUTED }}>
              Qty {item.quantity} × {formatMoney(item.unit_price)} = {formatMoney(item.subtotal)}
            </div>
            {item.access_variant && (
              <div className="mt-1 pl-2 border-l-2 border-gray-200">
                <span style={{ color: MUTED }} className="text-xs uppercase">
                  Access variant
                </span>
                <AccessVariantSummary v={item.access_variant} />
              </div>
            )}
            {item.metadata && Object.keys(item.metadata).length > 0 && (
              <div className="mt-2">
                <JsonBlock value={item.metadata} label="Line metadata" />
              </div>
            )}
          </li>
        ))}
      </ul>

      {(data.order_addon_items?.length ?? 0) > 0 && (
        <>
          <SectionTitle>Add-ons</SectionTitle>
          <ul className="space-y-2 text-sm">
            {(data.order_addon_items || []).map((a) => (
              <li key={a.id} style={{ color: TEXT }}>
                <span className="font-medium">{a.label || 'Add-on'}</span>
                {a.variant_label ? ` — ${a.variant_label}` : ''}
                <span style={{ color: MUTED }}>
                  {' '}
                  · Qty {a.quantity} · {formatMoney(a.subtotal)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Tickets</SectionTitle>
      <div className="space-y-3">
        {data.tickets.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-gray-200 p-3 text-sm space-y-1"
            style={{ color: TEXT }}
          >
            <p className="font-medium">
              {[t.first_name, t.last_name].filter(Boolean).join(' ') || 'Attendee'}
            </p>
            <p style={{ color: MUTED }}>{t.ticket_type?.name ?? 'Ticket'}</p>
            {t.ticket_type?.valid_for_days && (
              <p style={{ color: MUTED }}>Valid: {t.ticket_type.valid_for_days}</p>
            )}
            {t.email && <p>{t.email}</p>}
            {t.phone && <p>{t.phone}</p>}
            <p style={{ color: MUTED }}>
              Status: {t.status} · QR: {t.qr_code ? `${t.qr_code.slice(0, 8)}…` : '—'}
            </p>
          </div>
        ))}
      </div>

      {proofRef && (
        <>
          <SectionTitle>Payment proof</SectionTitle>
          <button type="button" className="text-sm underline" style={{ color: TEXT }} onClick={onOpenProof}>
            View receipt / proof
          </button>
        </>
      )}

      <SectionTitle>Raw metadata</SectionTitle>
      <JsonBlock value={meta} label="order.metadata (JSON)" />
      <div className="mt-4">
        <JsonBlock value={data} label="Full event order payload (JSON)" />
      </div>
    </>
  );
}

export interface HostOrderDetailViewProps {
  orderId: string;
  /** Search string for list route, e.g. `?tab=all&range=30d` */
  listSearch: string;
}

export function HostOrderDetailView({ orderId, listSearch }: HostOrderDetailViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrg } = useAuth();

  const [showProofDialog, setShowProofDialog] = useState(false);
  const [proofSignedUrl, setProofSignedUrl] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['host-order-detail', orderId, currentOrg?.id],
    queryFn: () => fetchHostOrderDetail(orderId),
    enabled: !!orderId && !!currentOrg,
  });

  const hostAllowed = useMemo(() => {
    if (!data || !currentOrg) return false;
    if (data.kind === 'product') return data.order.order.host_org_id === currentOrg.id;
    return data.order.event.org_id === currentOrg.id;
  }, [data, currentOrg]);

  const { data: collabDetailsAllowed, isLoading: collabAccessLoading } = useQuery({
    queryKey: ['collab-order-detail-access', orderId, currentOrg?.id],
    queryFn: () => collabPartnerCanViewOrderDetails(orderId),
    enabled: Boolean(orderId && currentOrg && data && !hostAllowed),
  });

  const payload = useMemo(() => {
    if (!data || !currentOrg) return null;
    if (data.kind === 'product') {
      if (data.order.order.host_org_id === currentOrg.id) return data;
      if (collabDetailsAllowed) return data;
      return null;
    }
    if (data.order.event.org_id === currentOrg.id) return data;
    if (collabDetailsAllowed) return data;
    return null;
  }, [data, currentOrg, collabDetailsAllowed]);

  const proofRef = useMemo(() => {
    if (!payload) return null;
    if (payload.kind === 'product') {
      return getPaymentProofRef(payload.order.order.receipt_url, payload.order.order.metadata as Record<string, unknown>);
    }
    return getPaymentProofRef(payload.order.receipt_url, payload.order.metadata);
  }, [payload]);

  useEffect(() => {
    const run = async () => {
      if (!showProofDialog) return;
      if (!proofRef) {
        setProofSignedUrl(null);
        return;
      }
      if (proofRef.startsWith('http://') || proofRef.startsWith('https://')) {
        setProofSignedUrl(proofRef);
        return;
      }
      setProofLoading(true);
      try {
        const { data: signed, error: signErr } = await supabase.storage
          .from('payment-receipts')
          .createSignedUrl(proofRef, 60 * 10);
        if (signErr) setProofSignedUrl(null);
        else setProofSignedUrl(signed?.signedUrl ?? null);
      } finally {
        setProofLoading(false);
      }
    };
    void run();
  }, [showProofDialog, proofRef]);

  const back = () => {
    const state = location.state as { ordersBackTo?: string } | null;
    if (state?.ordersBackTo) {
      navigate(state.ordersBackTo);
      return;
    }
    navigate({ pathname: '/app/orders', search: listSearch || undefined });
  };

  if (!currentOrg) {
    return (
      <div className="py-12 text-center text-sm" style={{ color: MUTED }}>
        Select an organization to view orders.
      </div>
    );
  }

  const waitingForCollabAccess = Boolean(data && !hostAllowed && collabAccessLoading);

  if (isLoading || waitingForCollabAccess) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <button type="button" className="inline-flex items-center gap-1 text-sm" style={{ color: TEXT }} onClick={back}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load order'}</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-4">
        <button type="button" className="inline-flex items-center gap-1 text-sm" style={{ color: TEXT }} onClick={back}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <p className="text-sm" style={{ color: MUTED }}>
          Order not found or you do not have access to this order.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('w-full space-y-2 pb-8')}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm hover:underline mb-2"
        style={{ color: TEXT }}
        onClick={back}
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <h1 className="text-2xl font-bold uppercase tracking-tight" style={{ color: TEXT }}>
        Order details
      </h1>

      {payload.kind === 'product' ? (
        <ProductDetailBody
          data={payload.order}
          proofRef={proofRef}
          onOpenProof={() => setShowProofDialog(true)}
        />
      ) : (
        <EventDetailBody
          data={payload.order}
          proofRef={proofRef}
          onOpenProof={() => setShowProofDialog(true)}
        />
      )}

      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment proof</DialogTitle>
          </DialogHeader>
          {proofLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : proofSignedUrl ? (
            <div className="space-y-2">
              <a href={proofSignedUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                Open in new tab
              </a>
              {/\.(jpg|jpeg|png|gif|webp)$/i.test(proofSignedUrl.split('?')[0]) ? (
                <img src={proofSignedUrl} alt="Payment proof" className="w-full rounded-md border" />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not load proof file.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
