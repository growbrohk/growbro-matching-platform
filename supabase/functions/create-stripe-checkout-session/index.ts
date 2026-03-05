import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[create-stripe-checkout-session] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("Stripe is not configured");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { order_id } = await req.json();
    logStep("Request body", { order_id });

    if (!order_id) {
      throw new Error("order_id is required");
    }

    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "http://localhost:5173";

    // Fetch order with event and order_items via RPC (returns consistent structure)
    const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
      "get_order_with_event_and_tickets",
      { p_order_id: order_id }
    );

    if (rpcError || !rpcData) {
      logStep("Order not found", { order_id, error: rpcError?.message });
      throw new Error("Order not found");
    }

    const order = rpcData.order;
    const event = rpcData.event;
    const orderItems = rpcData.order_items || [];

    if (!order || !event) {
      throw new Error("Order or event not found");
    }

    if (order.payment_status !== "unpaid") {
      throw new Error("Order is not pending payment");
    }

    const totalAmount = Number(order.total_amount);
    if (totalAmount <= 0) {
      throw new Error("Order has no amount to pay");
    }

    if (!event.enable_stripe) {
      throw new Error("Stripe is not enabled for this event");
    }

    if (orderItems.length === 0) {
      throw new Error("Order has no items");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    logStep("Stripe initialized");

    // Build line items - Stripe uses smallest currency unit (cents for HKD)
    const currency = (order.currency || "hkd").toLowerCase();
    const lineItems = orderItems.map((item: { quantity: number; unit_price: number; ticket_type?: { name?: string } }) => ({
      price_data: {
        currency,
        product_data: {
          name: item.ticket_type?.name || "Ticket",
        },
        unit_amount: Math.round(Number(item.unit_price) * 100), // Convert to cents
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: { order_id },
      success_url: `${origin}/booking/success/${order_id}`,
      cancel_url: `${origin}/booking/payment/${order_id}`,
      customer_email: order.buyer_email || undefined,
    });

    logStep("Checkout session created", { sessionId: session.id });

    // Store session ID in orders for future refunds
    await supabaseClient
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
