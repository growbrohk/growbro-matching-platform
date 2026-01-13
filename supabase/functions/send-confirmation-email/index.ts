// Edge Function: Send confirmation email when order becomes confirmed
// Called by database trigger when fulfillment_status transitions to 'confirmed'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface RequestBody {
  order_id: string;
}

Deno.serve(async (req) => {
  try {
    // Parse request body
    const body: RequestBody = await req.json();
    const { order_id } = body;

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'order_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate environment variables
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Database service not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[send-confirmation-email] Processing order_id: ${order_id}`);

    // Fetch order
    const { data: order, error: orderError } = await supabase
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

    if (orderError || !order) {
      console.error(`[send-confirmation-email] Order fetch error:`, orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found', details: orderError?.message }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch event details separately
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('title, start_at, location_text')
      .eq('id', order.event_id)
      .single();

    if (eventError) {
      console.error(`[send-confirmation-email] Event fetch error:`, eventError);
      // Continue anyway - we'll use defaults
    }

    // Guard rail: Check if order is confirmed
    if (order.fulfillment_status !== 'confirmed') {
      console.log(`[send-confirmation-email] Order ${order_id} not confirmed, skipping`);
      return new Response(
        JSON.stringify({ skipped: 'not_confirmed', fulfillment_status: order.fulfillment_status }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Guard rail: Check if email already sent (idempotency)
    if (order.confirmation_email_sent_at) {
      console.log(`[send-confirmation-email] Order ${order_id} already sent email at ${order.confirmation_email_sent_at}`);
      return new Response(
        JSON.stringify({ skipped: 'already_sent', sent_at: order.confirmation_email_sent_at }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Guard rail: Check if buyer_email exists
    if (!order.buyer_email) {
      console.error(`[send-confirmation-email] Order ${order_id} missing buyer_email`);
      // Update order with error
      await supabase
        .from('orders')
        .update({ confirmation_email_error: 'Missing buyer_email' })
        .eq('id', order_id)
        .is('confirmation_email_sent_at', null);
      
      return new Response(
        JSON.stringify({ error: 'Missing buyer_email' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch tickets count
    const { count: ticketsCount, error: ticketsError } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order_id);

    if (ticketsError) {
      console.error(`[send-confirmation-email] Tickets count error:`, ticketsError);
    }

    const ticketsCountValue = ticketsCount || 0;

    // Prepare email data
    const eventTitle = event?.title || 'Event';
    const eventStartAt = event?.start_at ? new Date(event.start_at).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }) : 'TBA';
    const venue = event?.location_text || 'TBA';
    const buyerName = order.buyer_first_name || order.buyer_last_name 
      ? `${order.buyer_first_name || ''} ${order.buyer_last_name || ''}`.trim()
      : 'Guest';
    const orderNo = order.order_no || order.id.substring(0, 8).toUpperCase();
    const successUrl = `https://growbrohk.com/booking/success/${order_id}`;
    const amount = order.total_amount || 0;
    const currency = order.currency || 'HKD';

    // Compose email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Order Confirmation - ${eventTitle}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2563eb; margin-top: 0;">Order Confirmed!</h1>
            <p style="font-size: 18px; margin-bottom: 0;">Thank you for your purchase, ${buyerName}!</p>
          </div>

          <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #111827; margin-top: 0; font-size: 24px;">${eventTitle}</h2>
            
            <div style="margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>Order Number:</strong> ${orderNo}</p>
              <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${eventStartAt}</p>
              <p style="margin: 8px 0;"><strong>Venue:</strong> ${venue}</p>
              <p style="margin: 8px 0;"><strong>Tickets:</strong> ${ticketsCountValue} ${ticketsCountValue === 1 ? 'ticket' : 'tickets'}</p>
              ${amount > 0 ? `<p style="margin: 8px 0;"><strong>Amount Paid:</strong> ${currency} ${amount.toFixed(2)}</p>` : ''}
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${successUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">View Order Details</a>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
            <p>If you have any questions, please contact the event organizer.</p>
            <p style="margin-top: 10px;">This is an automated confirmation email. Please do not reply to this message.</p>
          </div>
        </body>
      </html>
    `;

    // Send email via Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'growbro Tickets <tickets@growbrohk.com>', // TODO: Update with your verified domain
        to: [order.buyer_email],
        subject: `[Confirmation] – ${eventTitle} Ticket`,
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error(`[send-confirmation-email] Resend API error:`, resendData);
      
      // Update order with error
      await supabase
        .from('orders')
        .update({ 
          confirmation_email_error: JSON.stringify(resendData) 
        })
        .eq('id', order_id)
        .is('confirmation_email_sent_at', null);

      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: resendData }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[send-confirmation-email] Email sent successfully for order ${order_id}, Resend ID: ${resendData.id}`);

    // Update order with success (idempotent write - only if still null)
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        confirmation_email_sent_at: new Date().toISOString(),
        confirmation_email_resend_id: resendData.id,
        confirmation_email_error: null,
      })
      .eq('id', order_id)
      .is('confirmation_email_sent_at', null);

    if (updateError) {
      console.error(`[send-confirmation-email] Failed to update order:`, updateError);
      // Don't fail the request if update fails - email was sent
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id,
        resend_id: resendData.id,
        sent_at: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-confirmation-email] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

