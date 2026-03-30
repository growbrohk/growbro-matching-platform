import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ============================================================================
   ENV VARS
============================================================================ */
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

/* ============================================================================
   HELPERS
============================================================================ */
function generateCorrelationId(): string {
  return crypto.randomUUID();
}

function formatPrice(amount: number, currency = 'HKD'): string {
  const symbol = currency === 'HKD' ? 'HK$' : currency;
  return `${symbol} ${amount.toFixed(2)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================================
   EDGE FUNCTION
============================================================================ */
Deno.serve(async (req) => {
  const correlationId = generateCorrelationId();

  try {
    /* ------------------------------------------------------------------------
       AUTH
    ------------------------------------------------------------------------ */
    const providedSecret = req.headers.get('X-Internal-Secret');
    if (!INTERNAL_FUNCTION_SECRET || providedSecret !== INTERNAL_FUNCTION_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', correlation_id: correlationId }),
        { status: 401 }
      );
    }

    /* ------------------------------------------------------------------------
       BODY
    ------------------------------------------------------------------------ */
    const body = await req.json();

    const order_id =
      body.order_id ||
      body.record?.id ||
      body.new?.id ||
      body.data?.order_id;

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'order_id missing', correlation_id: correlationId }),
        { status: 400 }
      );
    }

    /* ------------------------------------------------------------------------
       SUPABASE
    ------------------------------------------------------------------------ */
    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order } = await supabase
      .from('orders')
      .select(`
        id,
        order_type,
        host_org_id,
        buyer_email,
        buyer_first_name,
        buyer_last_name,
        order_no,
        fulfillment_status,
        confirmation_email_sent_at,
        currency,
        total_amount,
        metadata
      `)
      .eq('id', order_id)
      .single();

    if (!order || order.order_type !== 'product') {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'not_product_order', correlation_id: correlationId }),
        { status: 200 }
      );
    }

    if (order.fulfillment_status !== 'confirmed') {
      return new Response(
        JSON.stringify({ skipped: true, correlation_id: correlationId }),
        { status: 200 }
      );
    }

    if (order.confirmation_email_sent_at) {
      return new Response(
        JSON.stringify({ skipped: 'already_sent', correlation_id: correlationId }),
        { status: 200 }
      );
    }

    if (!order.buyer_email) {
      return new Response(
        JSON.stringify({ error: 'Missing buyer_email', correlation_id: correlationId }),
        { status: 400 }
      );
    }

    /* ------------------------------------------------------------------------
       ORG (for name and slug)
    ------------------------------------------------------------------------ */
    const { data: org } = await supabase
      .from('orgs')
      .select('name, slug')
      .eq('id', order.host_org_id)
      .single();

    const orgName = org?.name || 'Seller';
    const orgSlug = org?.slug || '';

    /* ------------------------------------------------------------------------
       ORDER ITEMS (product order: metadata has product_name, variant_label)
    ------------------------------------------------------------------------ */
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('quantity, unit_price, subtotal, metadata')
      .eq('order_id', order_id);

    // Product orders only have product items (metadata.is_product_order = true)
    const items = (orderItems ?? []).filter(
      (item: { metadata?: { is_product_order?: boolean } }) =>
        item.metadata?.is_product_order === true
    );
    const itemsHtml = items.length > 0
      ? `<ul style="margin:0 0 1em 0;padding-left:20px">${items
          .map((item: { quantity: number; subtotal: number; metadata?: { product_name?: string; variant_label?: string } }) => {
            const name = [item.metadata?.product_name, item.metadata?.variant_label].filter(Boolean).join(' – ') || 'Item';
            return `<li>${item.quantity}x ${name} – ${formatPrice(item.subtotal ?? 0, order.currency)}</li>`;
          })
          .join('')}</ul>`
      : '<p>No items</p>';

    /* ------------------------------------------------------------------------
       FORMAT DATA
    ------------------------------------------------------------------------ */
    const buyerName =
      `${order.buyer_first_name || ''} ${order.buyer_last_name || ''}`.trim() ||
      'Guest';

    const orderNo = order.order_no || order.id.slice(0, 8).toUpperCase();
    const amount = order.total_amount || 0;
    const currency = order.currency || 'HKD';

    const orderUrl = orgSlug
      ? `https://growbrohk.com/${orgSlug}/checkout/success/${order_id}`
      : `https://growbrohk.com/`;

    const orderMeta = order.metadata as Record<string, unknown> | null | undefined;
    const dm = orderMeta?.delivery_method;
    let deliveryBlock = '';
    if (typeof dm === 'string' && dm) {
      const methodLabel =
        dm === 'door'
          ? 'Deliver to door'
          : dm === 'sf_locker'
            ? 'SF Locker'
            : dm === 'event_pickup'
              ? 'Pick up at event'
              : dm;
      const fee = orderMeta?.shipping_fee != null ? Number(orderMeta.shipping_fee) : 0;
      const kg = orderMeta?.shipping_weight_kg != null ? String(orderMeta.shipping_weight_kg) : '';
      const rate = orderMeta?.shipping_rate_per_kg != null ? String(orderMeta.shipping_rate_per_kg) : '';
      const det = orderMeta?.delivery_details as Record<string, unknown> | undefined;
      const lines: string[] = [`<p><strong>Method:</strong> ${escapeHtml(methodLabel)}</p>`];
      if (kg && dm !== 'event_pickup') {
        lines.push(`<p><strong>Total weight:</strong> ${escapeHtml(kg)} kg</p>`);
      }
      if (rate && Number(rate) > 0) {
        lines.push(`<p><strong>Rate:</strong> HK$${escapeHtml(rate)}/kg</p>`);
      }
      if (fee > 0) {
        lines.push(`<p><strong>Shipping fee:</strong> ${formatPrice(fee, currency)}</p>`);
      }
      if (dm === 'door' && det && typeof det === 'object') {
        const parts = [det.country, det.building, det.street, det.region, det.district]
          .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
          .map((x) => escapeHtml(x.trim()));
        if (parts.length) lines.push(`<p><strong>Address:</strong> ${parts.join(', ')}</p>`);
      }
      if (dm === 'sf_locker' && det && typeof det === 'object') {
        const addr = typeof det.sf_locker_address === 'string' ? det.sf_locker_address.trim() : '';
        const code = typeof det.sf_locker_code === 'string' ? det.sf_locker_code.trim() : '';
        if (addr) lines.push(`<p><strong>Locker address:</strong> ${escapeHtml(addr)}</p>`);
        if (code) lines.push(`<p><strong>Locker code:</strong> ${escapeHtml(code)}</p>`);
      }
      if (dm === 'event_pickup') {
        lines.push('<p>Please DM IG to arrange pick up.</p>');
      }
      deliveryBlock = `<h3>Delivery</h3>${lines.join('')}`;
    }

    /* ------------------------------------------------------------------------
       EMAIL HTML
    ------------------------------------------------------------------------ */
    const emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial; max-width:600px; margin:auto">
  <h2>Order Confirmed</h2>
  <p>Hi ${buyerName},</p>

  <p>Thank you for your order from <strong>${orgName}</strong>.</p>

  <h3>Order Details</h3>
  ${itemsHtml}
  ${deliveryBlock}
  <p><strong>Total:</strong> ${formatPrice(amount, currency)}</p>
  <p><strong>Order No:</strong> ${orderNo}</p>

  <p>
    <a href="${orderUrl}" style="padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
      View Order
    </a>
  </p>

  <p style="color:#666;font-size:12px">
    The seller will contact you about delivery or pickup.
  </p>

  <p style="color:#666;font-size:12px">
    This is an automated email. Please do not reply.
  </p>
</body>
</html>
`;

    /* ------------------------------------------------------------------------
       SEND EMAIL
    ------------------------------------------------------------------------ */
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Growbro Tickets <tickets@growbrohk.com>',
        to: [order.buyer_email],
        subject: `[Order Confirmation] – ${orgName} – Order #${orderNo}`,
        html: emailHtml,
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) throw resendData;

    /* ------------------------------------------------------------------------
       UPDATE ORDER
    ------------------------------------------------------------------------ */
    await supabase
      .from('orders')
      .update({
        confirmation_email_sent_at: new Date().toISOString(),
        confirmation_email_resend_id: resendData.id,
        confirmation_email_error: null,
      })
      .eq('id', order_id)
      .is('confirmation_email_sent_at', null);

    return new Response(
      JSON.stringify({ success: true, correlation_id: correlationId }),
      { status: 200 }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: 'Internal error', correlation_id: correlationId }),
      { status: 500 }
    );
  }
});
