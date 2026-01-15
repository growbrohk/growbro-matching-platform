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
       DETERMINE MESSAGE BODY BASED ON FULFILLMENT_STATUS
    ------------------------------------------------------------------------ */
    // fulfillment_status is the single source of truth
    const fulfillmentStatus = order.fulfillment_status || 'pending_confirmation';
    
    let messageBody: string;
    let statusDisplay: string;

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
       INSERT SYSTEM MESSAGE
    ------------------------------------------------------------------------ */
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'system',
        body: messageBody,
        metadata: {
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
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create message', 
          details: messageError.message,
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
        fulfillment_status: fulfillmentStatus,
        status_display: statusDisplay,
        correlation_id: correlationId 
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error('[send-order-created-message] Error:', err);
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

