-- Migration: Create customers and loyalty tables
-- Generated: 2026-08-21

CREATE TABLE IF NOT EXISTS public.lmb_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  name text NULL,
  phone text NULL,
  email text NULL,
  country text NOT NULL DEFAULT 'SN',
  pays text NULL,
  vip_level text NOT NULL DEFAULT 'STANDARD' CHECK (vip_level IN ('STANDARD', 'SILVER', 'GOLD', 'PLATINUM')),
  vip_status text NOT NULL DEFAULT 'STANDARD' CHECK (vip_status IN ('STANDARD', 'VIP', 'VIP_PREMIUM')),
  loyalty_points integer NOT NULL DEFAULT 0,
  points_fidelite integer NOT NULL DEFAULT 0,
  total_spent numeric(14,2) NOT NULL DEFAULT 0,
  total_spent_xof numeric(14,2) NOT NULL DEFAULT 0,
  total_depense numeric(14,2) NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  last_purchase_at timestamptz NULL,
  notes jsonb NULL,
  beauty_notes text NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lmb_customers_phone ON public.lmb_customers(phone);
CREATE INDEX IF NOT EXISTS idx_lmb_customers_email ON public.lmb_customers(email);
CREATE INDEX IF NOT EXISTS idx_lmb_customers_loyalty_points ON public.lmb_customers(loyalty_points);

CREATE TABLE IF NOT EXISTS public.lmb_customer_loyalty_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.lmb_customers(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'PURCHASE',
  points_delta integer NOT NULL DEFAULT 0,
  reason text NULL,
  related_order_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_lmb_customer_loyalty_events_customer_id ON public.lmb_customer_loyalty_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_lmb_customer_loyalty_events_created_at ON public.lmb_customer_loyalty_events(created_at);
