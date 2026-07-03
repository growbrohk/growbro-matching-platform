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

function maskHeaderValue(headerName: string, value: string | null): string {
  if (!value) return '<missing>';
  const lowerName = headerName.toLowerCase();
  if (
    lowerName.includes('secret') ||
    lowerName.includes('authorization') ||
    lowerName.includes('key')
  ) {
    return value.length > 8
      ? `${value.substring(0, 4)}***${value.substring(value.length - 4)}`
      : '***';
  }
  return value;
}

/** HKT formatter for single datetime */
function formatEventTimeHKT(dateString: string) {
  return new Date(dateString).toLocaleString('en-HK', {
    timeZone: 'Asia/Hong_Kong',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Format date/time for a ticket type based on valid_for_days (HKT) */
function formatTicketTypeDateTimeHKT(
  event: {
    start_at: string;
    end_at: string;
    day_2_start_at?: string | null;
    day_2_end_at?: string | null;
    day_3_start_at?: string | null;
    day_3_end_at?: string | null;
    day_4_start_at?: string | null;
    day_4_end_at?: string | null;
  },
  validForDays: string | null
): string {
  const validFor = validForDays || 'day_1';
  const slots = [
    { key: 'day_1', start: event.start_at, end: event.end_at },
    { key: 'day_2', start: event.day_2_start_at, end: event.day_2_end_at },
    { key: 'day_3', start: event.day_3_start_at, end: event.day_3_end_at },
    { key: 'day_4', start: event.day_4_start_at, end: event.day_4_end_at },
  ].filter((slot) => slot.start && slot.end) as { key: string; start: string; end: string }[];

  if (slots.length <= 1 || validFor === 'day_1') {
    return `${formatEventTimeHKT(event.start_at)} – ${formatEventTimeHKT(event.end_at)} (HKT)`;
  }

  if (validFor === 'all' || validFor === 'both') {
    return slots
      .map((slot) => `${formatEventTimeHKT(slot.start)} – ${formatEventTimeHKT(slot.end)}`)
      .join('; ') + ' (HKT)';
  }

  if (validFor === 'each') {
    return 'Per purchased time slot (see ticket details)';
  }

  const slot = slots.find((s) => s.key === validFor);
  if (slot) {
    return `${formatEventTimeHKT(slot.start)} – ${formatEventTimeHKT(slot.end)} (HKT)`;
  }

  return `${formatEventTimeHKT(event.start_at)} – ${formatEventTimeHKT(event.end_at)} (HKT)`;
}

function getValidForDaysLabelHKT(value: string): string {
  if (value === 'all' || value === 'both') return 'All time slots';
  if (value === 'each') return 'Each time slot';
  const slotNumber = value.replace('day_', '');
  return `Time Slot ${slotNumber} only`;
}

/* ============================================================================
   EDGE FUNCTION
============================================================================ */
Deno.serve(async (req) => {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

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
        buyer_email,
        buyer_first_name,
        buyer_last_name,
        order_no,
        fulfillment_status,
        confirmation_email_sent_at,
        currency,
        total_amount,
        event_id
      `)
      .eq('id', order_id)
      .single();

    if (!order || order.fulfillment_status !== 'confirmed') {
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
       EVENT
    ------------------------------------------------------------------------ */
    const { data: event } = await supabase
      .from('events')
      .select('title, start_at, end_at, day_2_start_at, day_2_end_at, day_3_start_at, day_3_end_at, day_4_start_at, day_4_end_at, location_text')
      .eq('id', order.event_id)
      .single();

    const { data: tickets } = await supabase
      .from('tickets')
      .select('id, time_slot, ticket_type:ticket_types(valid_for_days)')
      .eq('order_id', order_id)
      .order('created_at');

    const { data: orderItems } = await supabase
      .from('order_items')
      .select(`
        ticket_type_id,
        ticket_type:ticket_types(id, name, valid_for_days)
      `)
      .eq('order_id', order_id);

    const { data: orderAddonItems } = await supabase
      .from('order_addon_items')
      .select('label, variant_label, quantity, ticket_id')
      .eq('order_id', order_id)
      .order('created_at');

    const ticketsCount = tickets?.length ?? 0;
    const ticketIdToIndex = new Map<string, number>();
    tickets?.forEach((t, i) => ticketIdToIndex.set(t.id, i + 1));

    // Ensure tickets exist before sending email
    if (!ticketsCount || ticketsCount === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No tickets found for order', 
          correlation_id: correlationId 
        }),
        { status: 400 }
      );
    }

    /* ------------------------------------------------------------------------
       FORMAT DATA (per-ticket-type dates)
    ------------------------------------------------------------------------ */
    const eventTitle = event?.title || 'Event';
    let eventStartAt: string;
    if (event?.start_at && orderItems && orderItems.length > 0) {
      const ticketSlots = (tickets || [])
        .map((t: any) => t.time_slot as string | null)
        .filter(Boolean);
      const uniqueValidFor = [...new Set(
        orderItems.map((oi: any) => oi.ticket_type?.valid_for_days || 'day_1')
      )];
      if (ticketSlots.length > 0 && uniqueValidFor.every((v) => v === 'each')) {
        const slots = [
          { key: 'day_1', start: event.start_at, end: event.end_at },
          { key: 'day_2', start: event.day_2_start_at, end: event.day_2_end_at },
          { key: 'day_3', start: event.day_3_start_at, end: event.day_3_end_at },
          { key: 'day_4', start: event.day_4_start_at, end: event.day_4_end_at },
        ].filter((s) => s.start && s.end) as { key: string; start: string; end: string }[];
        eventStartAt = [...new Set(ticketSlots)]
          .map((slotKey) => {
            const slot = slots.find((s) => s.key === slotKey);
            if (!slot) return null;
            return `${getValidForDaysLabelHKT(slotKey)}: ${formatEventTimeHKT(slot.start)} – ${formatEventTimeHKT(slot.end)}`;
          })
          .filter(Boolean)
          .join('; ') + ' (HKT)';
      } else if (uniqueValidFor.length === 1) {
        eventStartAt = formatTicketTypeDateTimeHKT(event, uniqueValidFor[0]);
      } else {
        const dayLabels: Record<string, string> = {
          day_1: 'Time Slot 1',
          day_2: 'Time Slot 2',
          day_3: 'Time Slot 3',
          day_4: 'Time Slot 4',
          both: 'All time slots',
          all: 'All time slots',
        };
        eventStartAt = uniqueValidFor
          .map((vf: string) => {
            const formatted = formatTicketTypeDateTimeHKT(event, vf);
            return `${dayLabels[vf] || getValidForDaysLabelHKT(vf)}: ${formatted}`;
          })
          .join('; ');
      }
    } else {
      eventStartAt = event?.start_at
        ? `${formatEventTimeHKT(event.start_at)} (HKT)`
        : 'TBA';
    }
    const venue = event?.location_text || 'TBA';

    const buyerName =
      `${order.buyer_first_name || ''} ${order.buyer_last_name || ''}`.trim() ||
      'Guest';

    const orderNo = order.order_no || order.id.slice(0, 8).toUpperCase();
    const amount = order.total_amount || 0;
    const currency = order.currency || 'HKD';
    const ticketQty = ticketsCount || 0;
    
    // ✅ TICKET-BASED URL: Links to ticket QR code page (same for free and paid events)
    // This URL shows the ticket QR codes for the order, NOT payment pages
    // Works for both free events and paid events (PayMe/FPS/Stripe) after confirmation
    const ticketUrl = `https://growbrohk.com/booking/success/${order_id}`;

    const addonHtml =
      (orderAddonItems?.length ?? 0) > 0
        ? `<p><strong>Add-ons:</strong></p><ul style="margin:0 0 1em 0;padding-left:20px">${(orderAddonItems ?? [])
            .map((a: { label: string | null; variant_label: string | null; quantity: number; ticket_id: string | null }) => {
              const name = [a.label, a.variant_label].filter(Boolean).join(' – ');
              const ticketPrefix =
                a.ticket_id && ticketIdToIndex.has(a.ticket_id)
                  ? `Ticket ${ticketIdToIndex.get(a.ticket_id)}: `
                  : '';
              return `<li>${ticketPrefix}${name} × ${a.quantity}</li>`;
            })
            .join('')}</ul>`
        : '';

    /* ------------------------------------------------------------------------
       EMAIL HTML
    ------------------------------------------------------------------------ */
    const emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial; max-width:600px; margin:auto">
  <h2>Order Confirmed 🎉</h2>
  <p>Hi ${buyerName},</p>

  <h3>${eventTitle}</h3>
  <p><strong>Date & Time:</strong> ${eventStartAt}</p>
  <p><strong>Venue:</strong> ${venue}</p>
  <p><strong>Tickets:</strong> ${ticketQty}</p>
  ${addonHtml}
  ${amount > 0 ? `<p><strong>Amount Paid:</strong> ${currency} ${amount.toFixed(2)}</p>` : ''}

  <p><strong>Order No:</strong> ${orderNo}</p>

  <p>
    <a href="${ticketUrl}" style="padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
      View Ticket
    </a>
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
        subject: `[Confirmation] – ${eventTitle} Ticket`,
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
