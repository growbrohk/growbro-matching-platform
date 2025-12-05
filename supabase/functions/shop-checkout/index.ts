import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SHOP-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { product_id, quantity = 1, customer_email } = await req.json();
    logStep("Request body", { product_id, quantity, customer_email });

    if (!product_id) {
      throw new Error("Product ID is required");
    }

    // Get product
    const { data: product, error: productError } = await supabaseClient
      .from("products")
      .select("*")
      .eq("id", product_id)
      .eq("is_public", true)
      .eq("is_purchasable", true)
      .single();

    if (productError || !product) {
      throw new Error("Product not found or not available");
    }
    logStep("Product found", { name: product.name, price: product.price_in_cents });

    const origin = req.headers.get("origin") || "http://localhost:5173";

    // Handle free products (price = 0)
    if (product.price_in_cents === 0) {
      logStep("Free product - creating order directly");

      // Create order directly
      const { data: order, error: orderError } = await supabaseClient
        .from("orders")
        .insert({
          customer_email: customer_email || "guest@shop.com",
          status: "completed",
          total_amount_cents: 0,
          currency: product.currency || "hkd",
        })
        .select()
        .single();

      if (orderError) {
        throw new Error("Failed to create order: " + orderError.message);
      }

      // Create order item
      await supabaseClient.from("order_items").insert({
        order_id: order.id,
        product_id: product.id,
        quantity: quantity,
        unit_price_cents: 0,
      });

      // Deduct stock from warehouse first
      const { data: warehouseInventory } = await supabaseClient
        .from("product_inventory")
        .select("*, inventory_location:inventory_locations(*)")
        .eq("product_id", product_id)
        .gt("stock_quantity", 0)
        .order("stock_quantity", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (warehouseInventory) {
        await supabaseClient
          .from("product_inventory")
          .update({ stock_quantity: warehouseInventory.stock_quantity - quantity })
          .eq("id", warehouseInventory.id);
        logStep("Stock deducted", { location: warehouseInventory.inventory_location?.name });
      }

      return new Response(JSON.stringify({ order_id: order.id, success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Handle paid products with Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("Stripe is not configured");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    logStep("Stripe initialized");

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: product.currency || "hkd",
            product_data: {
              name: product.name,
              description: product.short_description || undefined,
              images: product.thumbnail_url ? [product.thumbnail_url] : undefined,
            },
            unit_amount: product.price_in_cents,
          },
          quantity: quantity,
        },
      ],
      mode: "payment",
      success_url: `${origin}/shop/products/${product.slug || product.id}?success=true`,
      cancel_url: `${origin}/shop/products/${product.slug || product.id}?canceled=true`,
      metadata: {
        product_id: product.id,
        quantity: quantity.toString(),
      },
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
