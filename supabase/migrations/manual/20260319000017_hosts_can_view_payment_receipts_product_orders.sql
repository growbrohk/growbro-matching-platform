-- For projects using policy "hosts_can_view_payment_receipts" (hosts only).
-- Add product-order support. Run via SQL Editor or edit via Storage Policy UI.
--
-- If editing via Storage UI: paste the USING expression below into the policy.

DROP POLICY IF EXISTS "hosts_can_view_payment_receipts" ON storage.objects;

CREATE POLICY "hosts_can_view_payment_receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts' AND (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN events e ON e.id = o.event_id
      JOIN org_members om ON om.org_id = e.org_id
      WHERE o.id::text = split_part(name, '/', 1) AND om.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM orders o
      JOIN org_members om ON om.org_id = o.host_org_id
      WHERE o.id::text = split_part(name, '/', 1) AND o.host_org_id IS NOT NULL AND om.user_id = auth.uid()
    )
  )
);

COMMENT ON POLICY "hosts_can_view_payment_receipts" ON storage.objects IS
  'Allows hosts to view receipts for event orders (via events.org_id) and product orders (via host_org_id).';
