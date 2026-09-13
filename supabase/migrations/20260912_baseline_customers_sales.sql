-- Migration : schéma de référence — clients, ventes & commandes fidélité
-- Generated: 2026-09-12
--
-- CONTEXTE
-- --------
-- `lmb_customers`, `lmb_sales` et `lmb_customer_orders` préexistaient en base
-- sans migration versionnée. Cette migration fige leur schéma réel (confirmé
-- via information_schema.columns, pg_constraint, pg_indexes).
--
-- NOTE : une définition partielle de `lmb_customers` figure déjà dans
-- 20260821_create_customers_tables.sql (avec des colonnes héritées supplémentaires
-- comme `name`, `vip_level`, `total_spent`…). Le CREATE TABLE IF NOT EXISTS
-- ci-dessous est donc un NO-OP sur toute base où cette migration a été appliquée ;
-- il n'existe que pour documenter le schéma réel courant et couvrir une base neuve.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Sur la base actuelle, aucune table/colonne/contrainte existante n'est modifiée.
--
-- RLS : NON gérée ici. Entièrement définie par 20260901_enable_rls.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_customers (
  id               uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  phone            text NULL UNIQUE,
  email            text NULL,
  country          text NULL DEFAULT 'SN',
  loyalty_points   integer NOT NULL DEFAULT 0,
  vip_status       text NOT NULL DEFAULT 'STANDARD',
  total_spent_xof  bigint NOT NULL DEFAULT 0,
  total_orders     integer NOT NULL DEFAULT 0,
  last_purchase_at timestamptz NULL,
  notes            jsonb NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  points_fidelite  integer NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lmb_customers_email          ON public.lmb_customers(email);
CREATE INDEX IF NOT EXISTS idx_lmb_customers_loyalty_points ON public.lmb_customers(loyalty_points);
CREATE INDEX IF NOT EXISTS idx_lmb_customers_phone          ON public.lmb_customers(phone);
CREATE INDEX IF NOT EXISTS idx_lmb_customers_vip            ON public.lmb_customers(vip_status);

-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_sales (
  id                     uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number         text NOT NULL UNIQUE,
  store_name             text NOT NULL,
  cashier_name           text NOT NULL,
  customer_id            text NULL,
  customer_name          text NULL,
  customer_phone         text NULL,
  total_amount_xof       numeric NOT NULL,
  total_discount_xof     numeric NULL DEFAULT 0,
  payment_method         text NOT NULL,
  payment_reference      text NULL,
  is_deposit             boolean NULL DEFAULT false,
  deposit_paid_xof       numeric NULL DEFAULT 0,
  remaining_balance_xof  numeric NULL DEFAULT 0,
  items_json             jsonb NOT NULL,
  created_at             timestamptz NULL DEFAULT now(),
  metadata               jsonb NULL DEFAULT '{}'::jsonb
);

-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_customer_orders (
  id                   uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES public.lmb_customers(id) ON DELETE CASCADE,
  sale_id              uuid NULL,
  store_code           text NULL,
  order_total_xof      bigint NOT NULL DEFAULT 0,
  discount_applied_xof bigint NOT NULL DEFAULT 0,
  points_earned        integer NOT NULL DEFAULT 0,
  points_redeemed      integer NOT NULL DEFAULT 0,
  payment_method       text NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  metadata             jsonb NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lmb_customer_orders_customer ON public.lmb_customer_orders(customer_id);

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('lmb_customers', 'lmb_sales', 'lmb_customer_orders');
-- =====================================================================
