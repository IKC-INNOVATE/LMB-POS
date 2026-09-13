-- Migration : schéma de référence — catalogue produits & promotions
-- Generated: 2026-09-12
--
-- CONTEXTE
-- --------
-- Les tables `lmb_products` et `lmb_promotions` préexistaient en base sans
-- migration versionnée (créées à la main dans le dashboard Supabase). Cette
-- migration fige leur schéma réel (confirmé via information_schema.columns,
-- pg_constraint, pg_indexes) pour qu'un nouvel environnement soit reproductible.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Sur la base actuelle, ces instructions sont des NO-OP : rien n'est recréé,
-- aucune colonne/contrainte existante n'est modifiée.
--
-- RLS : NON gérée ici. Entièrement définie par 20260901_enable_rls.sql.
-- Ne pas dupliquer ENABLE ROW LEVEL SECURITY ni les policies dans ce fichier.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_products (
  id                        text NOT NULL PRIMARY KEY,
  sku                       text NOT NULL UNIQUE,
  barcode                   text NULL,
  name                      text NOT NULL,
  category_name             text NOT NULL,
  standard_retail_price_xof numeric NOT NULL,
  floor_price_xof           numeric NOT NULL,
  cost_price_xof            numeric NULL DEFAULT 0,
  stock_dakar               integer NULL DEFAULT 0,
  stock_abidjan             integer NULL DEFAULT 0,
  created_at                timestamptz NULL DEFAULT now(),
  stock_reserve             integer NULL DEFAULT 0,
  stock_threshold           integer NULL DEFAULT 5
);

CREATE INDEX IF NOT EXISTS idx_lmb_products_stock_abidjan ON public.lmb_products(stock_abidjan);
CREATE INDEX IF NOT EXISTS idx_lmb_products_stock_dakar   ON public.lmb_products(stock_dakar);
CREATE INDEX IF NOT EXISTS idx_lmb_products_stock_reserve ON public.lmb_products(stock_reserve);

-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_promotions (
  id               uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  discount_type    text NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
  discount_value   numeric(14,2) NOT NULL DEFAULT 0,
  min_order_amount numeric(14,2) NOT NULL DEFAULT 0,
  start_date       timestamptz NULL,
  end_date         timestamptz NULL,
  usage_limit      integer NULL,
  usage_count      integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lmb_promotions_active ON public.lmb_promotions(is_active);
CREATE INDEX IF NOT EXISTS idx_lmb_promotions_code   ON public.lmb_promotions(code);

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('lmb_products', 'lmb_promotions');
-- =====================================================================
