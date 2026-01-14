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

/** ✅ THIS IS THE IMPORTANT PART — HKT FORMATTER */
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
      .select('title, start_at, location_text')
      .eq('id', order.event_id)
      .single();

    const { count: ticketsCount } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order_id);

    /* ------------------------------------------------------------------------
       FORMAT DATA (🔥 HKT HERE 🔥)
    ------------------------------------------------------------------------ */
    const eventTitle = event?.title || 'Event';
    const eventStartAt = event?.start_at
      ? `${formatEventTimeHKT(event.start_at)} (HKT)`
      : 'TBA';
    const venue = event?.location_text || 'TBA';

    const buyerName =
      `${order.buyer_first_name || ''} ${order.buyer_last_name || ''}`.trim() ||
      'Guest';

    const orderNo = order.order_no || order.id.slice(0, 8).toUpperCase();
    const amount = order.total_amount || 0;
    const currency = order.currency || 'HKD';
    const ticketQty = ticketsCount || 0;
    const successUrl = `https://growbrohk.com/booking/success/${order_id}`;

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
  ${amount > 0 ? `<p><strong>Amount Paid:</strong> ${currency} ${amount.toFixed(2)}</p>` : ''}

  <p><strong>Order No:</strong> ${orderNo}</p>

  <p>
    <a href="${successUrl}" style="padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
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
