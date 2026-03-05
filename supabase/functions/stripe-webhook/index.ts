import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[stripe-webhook] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
      },
    });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey || !webhookSecret) {
    logStep("ERROR", { message: "Stripe not configured" });
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) {
    logStep("ERROR", { message: "Missing Stripe-Signature header" });
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Must use raw body for signature verification
  const body = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStep("ERROR", { message: "Signature verification failed", error: msg });
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  logStep("Event received", { type: event.type, id: event.id });

  if (event.type !== "checkout.session.completed") {
    logStep("Ignoring event type", { type: event.type });
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.order_id;

  if (!orderId) {
    logStep("ERROR", { message: "No order_id in session metadata", sessionId: session.id });
    return new Response(JSON.stringify({ error: "Missing order_id in metadata" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  // Idempotency: only update if payment_status is still 'unpaid'
  const { data: order, error: fetchError } = await supabaseClient
    .from("orders")
    .select("id, payment_status")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    logStep("ERROR", { message: "Order not found", orderId, error: fetchError?.message });
    return new Response(JSON.stringify({ error: "Order not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (order.payment_status !== "unpaid") {
    logStep("Already processed", { orderId, payment_status: order.payment_status });
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseClient
    .from("orders")
    .update({
      payment_status: "paid",
      payment_method: "stripe",
      fulfillment_status: "confirmed",
      paid_at: now,
      confirmed_at: now,
      status: "paid",
    })
    .eq("id", orderId)
    .eq("payment_status", "unpaid"); // Idempotency guard

  if (updateError) {
    logStep("ERROR", { message: "Failed to update order", orderId, error: updateError.message });
    return new Response(JSON.stringify({ error: "Failed to update order" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  logStep("Order updated", { orderId });
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
