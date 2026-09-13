-- Migration: Create registers and register_expenses tables
-- Generated: 2026-08-21

CREATE TABLE IF NOT EXISTS public.lmb_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  initial_cash numeric(14,2) NOT NULL DEFAULT 0,
  total_cash_sales numeric(14,2) NOT NULL DEFAULT 0,
  total_expenses numeric(14,2) NOT NULL DEFAULT 0,
  counted_cash numeric(14,2) NULL,
  variance numeric(14,2) NULL,
  cashier_name text NULL,
  status text NOT NULL DEFAULT 'OPEN',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lmb_registers_store_code ON public.lmb_registers(store_code);
CREATE INDEX IF NOT EXISTS idx_lmb_registers_status ON public.lmb_registers(status);

CREATE TABLE IF NOT EXISTS public.lmb_register_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id uuid NOT NULL REFERENCES public.lmb_registers(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  reason text NULL,
  cashier_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lmb_register_expenses_register_id ON public.lmb_register_expenses(register_id);

-- Optional: trigger to update totals on insert/delete of expenses could be added later
