-- Migration: Create suppliers and purchase orders tables
-- Created: 2026-08-21

CREATE TABLE IF NOT EXISTS public.lmb_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text NULL,
  email text NULL,
  phone text NULL,
  address text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lmb_suppliers_name ON public.lmb_suppliers(name);
CREATE INDEX IF NOT EXISTS idx_lmb_suppliers_email ON public.lmb_suppliers(email);

CREATE TABLE IF NOT EXISTS public.lmb_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.lmb_suppliers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ORDERED', 'RECEIVED')),
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_lmb_purchase_orders_supplier_id ON public.lmb_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_lmb_purchase_orders_status ON public.lmb_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_lmb_purchase_orders_created_at ON public.lmb_purchase_orders(created_at);
