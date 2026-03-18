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

    // Try event order first
    const { data: eventRpcData, error: eventRpcError } = await supabaseClient.rpc(
      "get_order_with_event_and_tickets",
      { p_order_id: order_id }
    );

    let order: Record<string, unknown>;
    let orderItems: Array<{ quantity: number; unit_price: number; ticket_type?: { name?: string }; product_name?: string; variant_label?: string }>;
    let successUrl: string;
    let cancelUrl: string;
    let enableStripe = false;

    if (!eventRpcError && eventRpcData?.order && eventRpcData?.event) {
      // Event order
      const event = eventRpcData.event;
      order = eventRpcData.order;
      orderItems = eventRpcData.order_items || [];
      enableStripe = !!event.enable_stripe;
      successUrl = `${origin}/booking/success/${order_id}`;
      cancelUrl = `${origin}/booking/payment/${order_id}`;
    } else {
      // Try product order
      const { data: productRpcData, error: productRpcError } = await supabaseClient.rpc(
        "get_order_with_org_and_products",
        { p_order_id: order_id }
      );

      if (productRpcError || !productRpcData?.order || !productRpcData?.org) {
        logStep("Order not found", { order_id, error: productRpcError?.message });
        throw new Error("Order not found");
      }

      const org = productRpcData.org;
      order = productRpcData.order;
      orderItems = productRpcData.order_items || [];
      enableStripe = !!org.enable_stripe;
      const orgSlug = org.slug || org.id;
      successUrl = `${origin}/${orgSlug}/checkout/success/${order_id}`;
      cancelUrl = `${origin}/${orgSlug}/checkout/payment/${order_id}`;
    }

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.payment_status !== "unpaid") {
      throw new Error("Order is not pending payment");
    }

    const totalAmount = Number(order.total_amount);
    if (totalAmount <= 0) {
      throw new Error("Order has no amount to pay");
    }

    if (!enableStripe) {
      throw new Error("Stripe is not enabled for this order");
    }

    if (orderItems.length === 0) {
      throw new Error("Order has no items");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    logStep("Stripe initialized");

    // Build line items - Stripe uses smallest currency unit (cents for HKD)
    const currency = ((order.currency as string) || "hkd").toLowerCase();
    const lineItems = orderItems.map((item) => {
      const name = item.ticket_type?.name || item.product_name || "Item";
      const variantLabel = item.variant_label ? ` (${item.variant_label})` : "";
      return {
        price_data: {
          currency,
          product_data: {
            name: `${name}${variantLabel}`,
          },
          unit_amount: Math.round(Number(item.unit_price) * 100),
        },
        quantity: item.quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: { order_id },
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: (order.buyer_email as string) || undefined,
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
