-- Migration: Create promotions table
-- Generated: 2026-08-21

CREATE TABLE IF NOT EXISTS public.lmb_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
  discount_value numeric(14,2) NOT NULL DEFAULT 0,
  min_order_amount numeric(14,2) NOT NULL DEFAULT 0,
  start_date timestamptz NULL,
  end_date timestamptz NULL,
  usage_limit integer NULL,
  usage_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lmb_promotions_code ON public.lmb_promotions(code);
CREATE INDEX IF NOT EXISTS idx_lmb_promotions_active ON public.lmb_promotions(is_active);
