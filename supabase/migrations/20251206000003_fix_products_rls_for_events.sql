-- ============================================
-- Fix RLS Policies for Products Table to Support Event Tickets
-- ============================================
-- This migration ensures RLS policies allow creating products with event_id
-- and product_class = 'event_ticket'

-- First, let's check and update the INSERT policy for products
-- Drop existing policies if they're too restrictive
DROP POLICY IF EXISTS "Users can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Brands can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Users can create products" ON public.products;

-- Create a comprehensive INSERT policy that allows:
-- 1. Regular products (owner_user_id = auth.uid() OR brand_user_id = auth.uid())
-- 2. Event ticket products (event_id exists and brand_id matches)
CREATE POLICY "Users can insert their own products"
  ON public.products FOR INSERT
  WITH CHECK (
    -- Allow if owner_user_id matches current user (new unified system)
    owner_user_id = auth.uid()
    OR
    -- Allow if brand_user_id matches current user (legacy support)
    brand_user_id = auth.uid()
    OR
    -- Allow if it's an event ticket and the event belongs to the user
    (
      product_class = 'event_ticket'
      AND event_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id = products.event_id
        AND events.brand_id = auth.uid()
      )
    )
  );

-- Also ensure UPDATE policy allows updating event ticket products
DROP POLICY IF EXISTS "Users can update their own products" ON public.products;
DROP POLICY IF EXISTS "Brands can update their own products" ON public.products;

CREATE POLICY "Users can update their own products"
  ON public.products FOR UPDATE
  USING (
    -- Allow if owner_user_id matches current user (new unified system)
    owner_user_id = auth.uid()
    OR
    -- Allow if brand_user_id matches current user (legacy support)
    brand_user_id = auth.uid()
    OR
    -- Allow if it's an event ticket and the event belongs to the user
    (
      product_class = 'event_ticket'
      AND event_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id = products.event_id
        AND events.brand_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    -- Same conditions for the updated row
    owner_user_id = auth.uid()
    OR
    brand_user_id = auth.uid()
    OR
    (
      product_class = 'event_ticket'
      AND event_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id = products.event_id
        AND events.brand_id = auth.uid()
      )
    )
  );

-- Ensure SELECT policy allows viewing event ticket products
DROP POLICY IF EXISTS "Users can view their own products" ON public.products;
DROP POLICY IF EXISTS "Brands can view their own products" ON public.products;
DROP POLICY IF EXISTS "Public products are viewable by everyone" ON public.products;

CREATE POLICY "Users can view their own products"
  ON public.products FOR SELECT
  USING (
    -- Allow if owner_user_id matches current user (new unified system)
    owner_user_id = auth.uid()
    OR
    -- Allow if brand_user_id matches current user (legacy support)
    brand_user_id = auth.uid()
    OR
    -- Allow if it's an event ticket and the event belongs to the user
    (
      product_class = 'event_ticket'
      AND event_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id = products.event_id
        AND events.brand_id = auth.uid()
      )
    )
    OR
    -- Allow public products to be viewed by everyone
    (is_public = true AND is_active = true)
  );

-- Ensure DELETE policy allows deleting event ticket products
DROP POLICY IF EXISTS "Users can delete their own products" ON public.products;
DROP POLICY IF EXISTS "Brands can delete their own products" ON public.products;

CREATE POLICY "Users can delete their own products"
  ON public.products FOR DELETE
  USING (
    -- Allow if owner_user_id matches current user (new unified system)
    owner_user_id = auth.uid()
    OR
    -- Allow if brand_user_id matches current user (legacy support)
    brand_user_id = auth.uid()
    OR
    -- Allow if it's an event ticket and the event belongs to the user
    (
      product_class = 'event_ticket'
      AND event_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id = products.event_id
        AND events.brand_id = auth.uid()
      )
    )
  );

