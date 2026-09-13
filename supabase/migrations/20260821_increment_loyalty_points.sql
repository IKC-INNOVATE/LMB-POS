CREATE OR REPLACE FUNCTION increment_loyalty_points(
  customer_id UUID,
  increment INT,
  amount_spent NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.lmb_customers
  SET
    loyalty_points = COALESCE(loyalty_points, 0) + increment,
    total_spent_xof = COALESCE(total_spent_xof, 0) + amount_spent,
    last_purchase_at = NOW()
  WHERE id = customer_id;
END;
$$;
