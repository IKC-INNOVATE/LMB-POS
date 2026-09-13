-- Migration: enregistrement atomique d'une vente + décrément du stock
-- Generated: 2026-09-04
--
-- CONTEXTE
-- --------
-- Jusqu'ici, createSaleWithCustomer (lib/services/sales.ts) faisait un simple
-- INSERT dans lmb_sales et ne touchait jamais stock_dakar / stock_abidjan.
-- Deux caissières pouvaient donc vendre "en même temps" le dernier exemplaire
-- d'un produit : le contrôle côté panier n'est qu'un confort d'affichage, pas
-- une garantie au moment de l'enregistrement.
--
-- OBJECTIF
-- --------
-- Une fonction unique, transactionnelle et SECURITY DEFINER qui :
--   1. Verrouille (FOR UPDATE) les lignes produits concernées.
--   2. Vérifie le stock réel de la bonne boutique pour CHAQUE article.
--   3. Si un seul article est insuffisant -> RAISE EXCEPTION : rien n'est
--      inséré, rien n'est décrémenté (toute la transaction est annulée).
--   4. Sinon -> INSERT dans lmb_sales + UPDATE du stock de chaque produit,
--      et renvoie la ligne de vente créée (avec son id).
--
-- Idempotente : CREATE OR REPLACE + REVOKE/GRANT rejouables.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.record_sale_and_decrement_stock(
  p_sale jsonb,
  p_items jsonb,
  p_store_city text
)
RETURNS public.lmb_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := upper(trim(coalesce(p_store_city, '')));
  v_stock_col text;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_available integer;
  v_name text;
  v_sale public.lmb_sales;
BEGIN
  -- 1. Boutique -> colonne de stock
  IF v_city = 'DAKAR' THEN
    v_stock_col := 'stock_dakar';
  ELSIF v_city = 'ABIDJAN' THEN
    v_stock_col := 'stock_abidjan';
  ELSE
    RAISE EXCEPTION 'Boutique inconnue pour la vente: "%". Attendu DAKAR ou ABIDJAN.', p_store_city;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Aucun article à vendre (p_items vide).';
  END IF;

  -- 2. Verrouillage + contrôle du stock réel, article par article.
  --    FOR UPDATE bloque toute autre vente concurrente sur les mêmes produits
  --    jusqu'à la fin de CETTE transaction.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NULL THEN
      v_product_id := nullif(v_item->>'id', '')::uuid;
    END IF;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0)::integer;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Article sans product_id valide dans le panier: %', v_item;
    END IF;
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT name, coalesce(%I, 0) FROM public.lmb_products WHERE id = $1 FOR UPDATE',
      v_stock_col
    )
    INTO v_name, v_available
    USING v_product_id;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Produit introuvable (id=%).', v_product_id;
    END IF;

    IF v_available < v_qty THEN
      RAISE EXCEPTION
        'Stock insuffisant pour "%": % demandé(s), % restant(s) en boutique %.',
        v_name, v_qty, v_available, v_city;
    END IF;
  END LOOP;

  -- 3. Tout est bon : on insère la vente à partir des colonnes standardisées
  --    portées par p_sale. On n'énumère que des colonnes connues pour laisser
  --    les valeurs par défaut (id, created_at...) s'appliquer si elles manquent.
  DECLARE
    v_has_metadata boolean := EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lmb_sales' AND column_name = 'metadata'
    );
  BEGIN
    IF v_has_metadata THEN
      INSERT INTO public.lmb_sales (total_amount, payment_method, store_code, created_at, metadata)
      VALUES (
        (p_sale->>'total_amount')::numeric,
        coalesce(p_sale->>'payment_method', 'ESPECES'),
        coalesce(p_sale->>'store_code', 'INCONNU'),
        coalesce((p_sale->>'created_at')::timestamptz, now()),
        coalesce(p_sale->'metadata', '{}'::jsonb)
      )
      RETURNING * INTO v_sale;
    ELSE
      INSERT INTO public.lmb_sales (total_amount, payment_method, store_code, created_at)
      VALUES (
        (p_sale->>'total_amount')::numeric,
        coalesce(p_sale->>'payment_method', 'ESPECES'),
        coalesce(p_sale->>'store_code', 'INCONNU'),
        coalesce((p_sale->>'created_at')::timestamptz, now())
      )
      RETURNING * INTO v_sale;
    END IF;
  END;

  -- 4. Décrément du stock dans la bonne colonne, pour chaque article.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NULL THEN
      v_product_id := nullif(v_item->>'id', '')::uuid;
    END IF;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0)::integer;
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.lmb_products SET %I = coalesce(%I, 0) - $1 WHERE id = $2',
      v_stock_col, v_stock_col
    )
    USING v_qty, v_product_id;
  END LOOP;

  RETURN v_sale;
END;
$$;

-- La fonction ne doit être appelable que par un employé authentifié
-- (même règle que increment_loyalty_points). Jamais par le rôle anon.
REVOKE EXECUTE ON FUNCTION public.record_sale_and_decrement_stock(jsonb, jsonb, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_sale_and_decrement_stock(jsonb, jsonb, text) TO authenticated;
