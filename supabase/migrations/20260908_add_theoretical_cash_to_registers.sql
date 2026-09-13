-- Migration: ajout de la colonne `theoretical_cash` sur `lmb_registers`
-- Generated: 2026-09-08
--
-- CONTEXTE
-- --------
-- `closeRegister()` (lib/services/register.ts) calcule un fond de caisse
-- THÉORIQUE = initial_cash + ventes espèces de la session - sorties de caisse,
-- puis tente de l'écrire dans `lmb_registers.theoretical_cash`.
--
-- La table créée par 20260821_create_register_tables.sql ne contient PAS cette
-- colonne (elle a `total_cash_sales`, `total_expenses`, `counted_cash`,
-- `variance`, `closed_at`, ... mais pas `theoretical_cash`). D'où l'erreur au
-- moment d'une clôture :
--
--   column "theoretical_cash" of relation "lmb_registers" does not exist
--
-- CORRECTION
-- ----------
-- Migration ADDITIVE : on ajoute la colonne manquante. Aucune migration déjà
-- appliquée n'est modifiée. `IF NOT EXISTS` -> rejouable sans risque.
--
-- Pour vérifier les colonnes réelles de la table (lecture seule) :
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'lmb_registers'
--   ORDER BY ordinal_position;
-- =====================================================================

ALTER TABLE public.lmb_registers
  ADD COLUMN IF NOT EXISTS theoretical_cash numeric(14,2);

COMMENT ON COLUMN public.lmb_registers.theoretical_cash IS
  'Fond de caisse théorique calculé à la clôture : initial_cash + ventes espèces de la session - sorties de caisse. À comparer à counted_cash (écart = variance).';
