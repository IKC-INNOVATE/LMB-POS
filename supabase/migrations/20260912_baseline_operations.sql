-- Migration : schéma de référence — opérations magasin
--             (dépenses, pointage, caisses, transferts)
-- Generated: 2026-09-12
--
-- CONTEXTE
-- --------
-- `lmb_expenses`, `lmb_attendance`, `lmb_registers` et `lmb_transfers`
-- préexistaient en base. `lmb_registers` et `lmb_transfers` ont des migrations
-- versionnées partielles (20260821_create_register_tables.sql,
-- 20260821_create_transfers_tables.sql, 20260907_normalize_transfers.sql,
-- 20260908_add_theoretical_cash_to_registers.sql) ; `lmb_expenses` et
-- `lmb_attendance` n'en avaient aucune. Cette migration fige le schéma réel
-- courant (confirmé via information_schema.columns, pg_constraint, pg_indexes).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Sur la base actuelle, aucune table/colonne/contrainte existante n'est modifiée.
--
-- RLS : NON gérée ici. Entièrement définie par 20260901_enable_rls.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_expenses (
  id          uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  store_city  text NOT NULL,
  category    text NOT NULL,
  reason      text NOT NULL,
  amount_xof  numeric NOT NULL,
  recorded_by text NOT NULL,
  created_at  timestamptz NULL DEFAULT now()
);

-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_attendance (
  id               uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_name     text NOT NULL,
  store_city       text NOT NULL,
  type             text NOT NULL,
  timestamp        timestamptz NULL DEFAULT now(),
  camera_reference text NULL
);

-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_registers (
  id                uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code        text NOT NULL,
  opened_at         timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz NULL,
  initial_cash      numeric(14,2) NOT NULL DEFAULT 0,
  total_cash_sales  numeric(14,2) NOT NULL DEFAULT 0,
  total_expenses    numeric(14,2) NOT NULL DEFAULT 0,
  counted_cash      numeric(14,2) NULL,
  variance          numeric(14,2) NULL,
  cashier_name      text NULL,
  status            text NOT NULL DEFAULT 'OPEN',
  notes             text NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  theoretical_cash  numeric(14,2) NULL
);

CREATE INDEX IF NOT EXISTS idx_lmb_registers_status     ON public.lmb_registers(status);
CREATE INDEX IF NOT EXISTS idx_lmb_registers_store_code ON public.lmb_registers(store_code);

-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_transfers (
  id                   uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_number           text NOT NULL UNIQUE,
  from_city            text NOT NULL,
  to_city              text NOT NULL,
  product_sku          text NOT NULL,
  product_name         text NOT NULL,
  quantity             integer NOT NULL,
  status               text NULL DEFAULT 'EN_TRANSIT',
  carrier              text NULL,
  created_at           timestamptz NULL DEFAULT now(),
  transfer_number      text NULL,
  source_location      text NULL,
  destination_location text NULL,
  items                jsonb NULL DEFAULT '[]'::jsonb,
  created_by           text NULL,
  confirmed_at         timestamptz NULL,
  metadata             jsonb NULL DEFAULT '{}'::jsonb
);

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN
--     ('lmb_expenses', 'lmb_attendance', 'lmb_registers', 'lmb_transfers');
-- =====================================================================
