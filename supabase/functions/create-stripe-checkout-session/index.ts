import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_FEE_RATE = 0.034;
const STRIPE_FEE_FIXED = 2.35;

function computeStripeProcessingFee(orderAmount: number): number {
  const total = Number(orderAmount) || 0;
  return Math.round((total * STRIPE_FEE_RATE + STRIPE_FEE_FIXED) * 100) / 100;
}

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
    let orderAddonItems: Array<{ quantity: number; unit_price: number; label?: string; variant_label?: string }> = [];
    let successUrl: string;
    let cancelUrl: string;
    let enableStripe = false;
    let stripeFeeBearer: "host" | "user" = "host";

    if (!eventRpcError && eventRpcData?.order && eventRpcData?.event) {
      // Event order
      const event = eventRpcData.event;
      order = eventRpcData.order;
      orderItems = eventRpcData.order_items || [];
      orderAddonItems = eventRpcData.order_addon_items || [];
      enableStripe = !!event.enable_stripe;
      stripeFeeBearer = event.stripe_fee_bearer === "user" ? "user" : "host";
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
      stripeFeeBearer = org.stripe_fee_bearer === "user" ? "user" : "host";
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

    const orderMeta = order.metadata as Record<string, unknown> | undefined;
    if (order.order_type === "product") {
      const shippingFee = Number(orderMeta?.shipping_fee ?? 0);
      if (shippingFee > 0) {
        const method = String(orderMeta?.delivery_method ?? "");
        const shippingLabel =
          method === "door"
            ? "Shipping — Deliver to door"
            : method === "sf_locker"
              ? "Shipping — SF Locker"
              : "Shipping";
        lineItems.push({
          price_data: {
            currency,
            product_data: { name: shippingLabel },
            unit_amount: Math.round(shippingFee * 100),
          },
          quantity: 1,
        });
      }
    }

    const addonLineItems = orderAddonItems.map((addon) => ({
      price_data: {
        currency,
        product_data: {
          name: `${addon.label || "Add-on"}${addon.variant_label ? ` (${addon.variant_label})` : ""}`,
        },
        unit_amount: Math.round(Number(addon.unit_price) * 100),
      },
      quantity: addon.quantity,
    }));
    lineItems.push(...addonLineItems);

    if (lineItems.length === 0) {
      throw new Error("Order has no items");
    }

    const lineTotalCents = lineItems.reduce((sum, li) => {
      return sum + li.price_data.unit_amount * li.quantity;
    }, 0);

    let stripeServiceFee = 0;
    if (stripeFeeBearer === "user") {
      const subtotalAmount = lineTotalCents / 100;
      stripeServiceFee = computeStripeProcessingFee(subtotalAmount);
      if (stripeServiceFee > 0) {
        lineItems.push({
          price_data: {
            currency,
            product_data: {
              name: "Credit card service charge (3.4% + HK$2.35)",
            },
            unit_amount: Math.round(stripeServiceFee * 100),
          },
          quantity: 1,
        });
      }
    }

    const checkoutTotalCents = lineItems.reduce((sum, li) => {
      return sum + li.price_data.unit_amount * li.quantity;
    }, 0);
    const orderTotalCents = Math.round(totalAmount * 100);
    if (stripeFeeBearer === "host" && lineTotalCents !== orderTotalCents) {
      logStep("Line items total mismatch order.total_amount", {
        lineTotalCents,
        orderTotalCents,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: { order_id },
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: (order.buyer_email as string) || undefined,
    });

    logStep("Checkout session created", { sessionId: session.id });

    const existingMetadata =
      order.metadata && typeof order.metadata === "object"
        ? order.metadata as Record<string, unknown>
        : {};
    const orderUpdate: Record<string, unknown> = {
      stripe_checkout_session_id: session.id,
    };
    if (stripeServiceFee > 0) {
      orderUpdate.metadata = {
        ...existingMetadata,
        stripe_service_fee: stripeServiceFee,
        stripe_fee_bearer: stripeFeeBearer,
      };
    }

    // Store session ID in orders for future refunds
    await supabaseClient
      .from("orders")
      .update(orderUpdate)
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
