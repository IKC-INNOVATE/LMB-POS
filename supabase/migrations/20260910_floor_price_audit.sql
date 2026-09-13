-- Migration: journal d'audit des ventes SOUS LE PRIX PLANCHER
-- Generated: 2026-09-10
--
-- CONTEXTE
-- --------
-- `floor_price_xof` (colonne de lmb_products) et `isUnderFloorPrice` (calcul
-- côté caisse dans app/page.tsx) existaient déjà mais n'étaient JAMAIS
-- appliqués : un caissier pouvait négocier un prix sous le plancher sans aucun
-- blocage, alerte ni trace.
--
-- CORRECTION
-- ----------
-- 1. FRONT (app/page.tsx) : le prix unitaire de chaque ligne du panier est
--    maintenant éditable ; s'il passe sous `floor_price_xof`, la ligne vire au
--    rouge, un bandeau d'avertissement s'affiche, et la validation exige une
--    confirmation explicite (window.confirm) — quel que soit le rôle.
-- 2. BASE (cette migration) : journalisation d'audit NON BLOQUANTE. La vente
--    transactionnelle (record_sale_and_decrement_stock, 20260906) n'est PAS
--    modifiée. Après l'enregistrement réussi de la vente, sales.ts appelle
--    `log_floor_price_sale(...)` qui insère une ligne par article vendu sous
--    son plancher dans `lmb_floor_price_alerts`.
--
-- POURQUOI NE PAS BLOQUER EN BASE ?
-- --------------------------------
-- Bloquer dans record_sale_and_decrement_stock obligerait cette fonction à
-- relire le prix plancher et ferait ÉCHOUER des ventes en pleine affluence
-- (geste commercial légitime, remise VIP cumulée, arrondi). Le garde-fou métier
-- est la confirmation explicite côté caisse ; la base fournit la PISTE D'AUDIT
-- fiable pour la direction (qui, quand, quel écart), sans risque d'échec de
-- vente. Si un blocage dur devient nécessaire, il se fera dans une migration
-- ultérieure de la fonction de vente.
--
-- Même modèle de sécurité que record_sale_and_decrement_stock :
--   SECURITY DEFINER + search_path = public
--   REVOKE EXECUTE FROM anon, public ; GRANT EXECUTE TO authenticated.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- N'altère AUCUNE migration déjà appliquée.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_floor_price_alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  receipt_number text,
  store_code     text,
  cashier_name   text,
  product_id     text,
  product_sku    text,
  product_name   text,
  quantity       integer,
  unit_price_xof numeric,
  floor_price_xof numeric,
  gap_xof        numeric,          -- floor_price_xof - unit_price_xof (écart par unité)
  reviewed       boolean NOT NULL DEFAULT false,
  reviewed_by    text,
  reviewed_at    timestamptz
);

COMMENT ON TABLE public.lmb_floor_price_alerts IS
  'Audit : une ligne par article vendu sous son prix plancher. Alimentée par log_floor_price_sale(). Non bloquant.';

-- RLS : lecture réservée aux comptes authentifiés (la direction consulte via
-- l'app) ; aucune écriture directe — tout passe par la fonction SECURITY DEFINER.
ALTER TABLE public.lmb_floor_price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lmb_floor_price_alerts_select ON public.lmb_floor_price_alerts;
CREATE POLICY lmb_floor_price_alerts_select
  ON public.lmb_floor_price_alerts
  FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================================

CREATE OR REPLACE FUNCTION public.log_floor_price_sale(
  p_receipt_number text,
  p_store text,
  p_cashier text,
  p_items jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item  jsonb;
  v_unit  numeric;
  v_floor numeric;
  v_count integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_unit  := nullif(v_item->>'unit_price_xof', '')::numeric;
    v_floor := nullif(v_item->>'floor_price_xof', '')::numeric;

    -- Garde-fou : on ne journalise que si c'est réellement sous le plancher.
    IF v_floor IS NULL OR v_floor <= 0 OR v_unit IS NULL OR v_unit >= v_floor THEN
      CONTINUE;
    END IF;

    INSERT INTO public.lmb_floor_price_alerts (
      receipt_number, store_code, cashier_name,
      product_id, product_sku, product_name,
      quantity, unit_price_xof, floor_price_xof, gap_xof
    )
    VALUES (
      p_receipt_number, p_store, p_cashier,
      nullif(v_item->>'product_id', ''),
      nullif(v_item->>'sku', ''),
      nullif(v_item->>'name', ''),
      coalesce(nullif(v_item->>'quantity', '')::integer, 0),
      v_unit, v_floor, (v_floor - v_unit)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_floor_price_sale(text, text, text, jsonb) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.log_floor_price_sale(text, text, text, jsonb) TO authenticated;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--   SELECT proname FROM pg_proc WHERE proname = 'log_floor_price_sale';
--   SELECT * FROM public.lmb_floor_price_alerts ORDER BY created_at DESC;
-- =====================================================================
