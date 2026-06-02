-- Allow POS payment methods on orders (cash, card-log, other)

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('stripe', 'payme', 'fps', 'free', 'cash', 'card-log', 'other')
  );
