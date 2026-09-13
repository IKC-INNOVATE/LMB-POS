-- Migration : colonnes de prix manquantes sur lmb_products
-- Generated: 2026-09-11
--
-- CONTEXTE
-- --------
-- Le code (types/index.ts, app/admin/page.tsx, lib/services/finance.ts,
-- lib/services/products.ts) référence depuis longtemps `cost_price_xof` et
-- `floor_price_xof` sur `lmb_products`, mais AUCUNE migration ne les crée :
-- la table `lmb_products` préexiste et ces colonnes ont été ajoutées à la main
-- (ou pas du tout) selon l'environnement.
--
-- La plupart des lectures utilisent `select('*')` et tolèrent donc l'absence
-- de la colonne. La tâche 2.5 (marge sur coût réel) avait introduit dans
-- getFinancialOverview un `select('id, sku, cost_price_xof')` explicite qui,
-- sur une base sans la colonne, renvoyait une 400 "column
-- lmb_products.cost_price_xof does not exist" (corrigé côté code : retour à
-- `select('*')`). Cette migration fiabilise durablement le schéma.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS. N'altère aucune migration appliquée.
-- =====================================================================

ALTER TABLE public.lmb_products
  ADD COLUMN IF NOT EXISTS cost_price_xof  numeric,
  ADD COLUMN IF NOT EXISTS floor_price_xof numeric;

COMMENT ON COLUMN public.lmb_products.cost_price_xof IS
  'Coût d''achat réel unitaire (FCFA). NULL / 0 = non renseigné -> marge estimée (lib/services/finance.ts).';
COMMENT ON COLUMN public.lmb_products.floor_price_xof IS
  'Prix plancher de vente (FCFA). Utilisé par le contrôle caisse et l''audit lmb_floor_price_alerts.';

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'lmb_products'
--     AND column_name IN ('cost_price_xof', 'floor_price_xof');
-- =====================================================================
