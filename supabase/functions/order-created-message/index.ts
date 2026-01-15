import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ============================================================================
   ENV VARS
============================================================================ */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

/* ============================================================================
   HELPERS
============================================================================ */
function generateCorrelationId(): string {
  return crypto.randomUUID();
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

    // Get trigger_reason from body (defaults to 'order_created' for backward compatibility)
    const trigger_reason = body.trigger_reason || 'order_created';

    /* ------------------------------------------------------------------------
       SUPABASE
    ------------------------------------------------------------------------ */
    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    );

    /* ------------------------------------------------------------------------
       FETCH ORDER + EVENT + TICKETS COUNT
    ------------------------------------------------------------------------ */
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        event_id,
        buyer_user_id,
        buyer_email,
        fulfillment_status,
        total_amount,
        currency
      `)
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ 
          error: 'Order not found', 
          details: orderError?.message,
          correlation_id: correlationId 
        }),
        { status: 404 }
      );
    }

    // Fetch event details
    const { data: event } = await supabase
      .from('events')
      .select('id, title, org_id')
      .eq('id', order.event_id)
      .single();

    // Count tickets
    const { count: ticketsCount } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order_id);

    /* ------------------------------------------------------------------------
       DETERMINE MESSAGE BODY BASED ON TRIGGER_REASON AND FULFILLMENT_STATUS
    ------------------------------------------------------------------------ */
    // fulfillment_status is the single source of truth
    const fulfillmentStatus = order.fulfillment_status || 'pending_confirmation';
    
    let messageBody: string;
    let statusDisplay: string;

    // For payment_submitted trigger, use specific message
    if (trigger_reason === 'payment_submitted') {
      messageBody = '💰 Payment receipt submitted — pending verification.';
      statusDisplay = 'Payment Submitted';
    } else {
      // For order_created trigger (or default), use fulfillment_status-based message
      if (fulfillmentStatus === 'confirmed') {
        messageBody = '✅ Order confirmed — your ticket is ready.';
        statusDisplay = 'Confirmed';
      } else if (fulfillmentStatus === 'pending_confirmation') {
        messageBody = '✅ Order received — pending confirmation.';
        statusDisplay = 'Pending';
      } else {
        // For cancelled or other statuses, still create a message
        messageBody = `✅ Order ${fulfillmentStatus}.`;
        statusDisplay = fulfillmentStatus;
      }
    }

    /* ------------------------------------------------------------------------
       GET OR CREATE CONVERSATION FOR ORDER
    ------------------------------------------------------------------------ */
    const { data: conversationData, error: conversationError } = await supabase
      .rpc('get_or_create_order_conversation', {
        p_order_id: order_id
      });

    if (conversationError) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get/create conversation', 
          details: conversationError.message,
          correlation_id: correlationId 
        }),
        { status: 500 }
      );
    }

    const conversationId = conversationData as string;

    /* ------------------------------------------------------------------------
       IDEMPOTENCY CHECK: Check if message already exists for this trigger_reason
    ------------------------------------------------------------------------ */
    if (trigger_reason === 'payment_submitted') {
      const { data: existingMessage, error: checkError } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'system')
        .eq('metadata->>trigger_reason', 'payment_submitted')
        .limit(1)
        .single();

      // If message already exists (and no error), return success without creating duplicate
      if (existingMessage && !checkError) {
        console.log(`[order-created-message] Payment submitted message already exists for order ${order_id}. Skipping.`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            conversation_id: conversationId,
            message_id: existingMessage.id,
            trigger_reason: trigger_reason,
            fulfillment_status: fulfillmentStatus,
            status_display: statusDisplay,
            skipped: true,
            correlation_id: correlationId 
          }),
          { status: 200 }
        );
      }
    }

    /* ------------------------------------------------------------------------
       INSERT SYSTEM MESSAGE
    ------------------------------------------------------------------------ */
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'system',
        body: messageBody,
        metadata: {
          trigger_reason: trigger_reason,
          fulfillment_status: fulfillmentStatus,
          status_display: statusDisplay,
          order_id: order_id,
          event_id: order.event_id,
          event_title: event?.title || null,
          tickets_count: ticketsCount || 0,
          total_amount: order.total_amount,
          currency: order.currency || 'HKD'
        }
      })
      .select()
      .single();

    if (messageError) {
      // If error is due to unique constraint violation, treat as success (idempotency)
      if (messageError.code === '23505' && trigger_reason === 'payment_submitted') {
        console.log(`[order-created-message] Unique constraint violation for payment_submitted message (order ${order_id}). Treating as success.`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            conversation_id: conversationId,
            trigger_reason: trigger_reason,
            fulfillment_status: fulfillmentStatus,
            status_display: statusDisplay,
            skipped: true,
            correlation_id: correlationId 
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: 'Failed to create message', 
          details: messageError.message,
          code: messageError.code,
          correlation_id: correlationId 
        }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        conversation_id: conversationId,
        message_id: message.id,
        trigger_reason: trigger_reason,
        fulfillment_status: fulfillmentStatus,
        status_display: statusDisplay,
        correlation_id: correlationId 
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error('[order-created-message] Error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Internal error', 
        details: err instanceof Error ? err.message : String(err),
        correlation_id: correlationId 
      }),
      { status: 500 }
    );
  }
});

