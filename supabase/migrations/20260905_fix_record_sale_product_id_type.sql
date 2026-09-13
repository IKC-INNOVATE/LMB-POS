-- Migration: correction du type d'identifiant produit dans
--            record_sale_and_decrement_stock
-- Generated: 2026-09-05
--
-- CONTEXTE
-- --------
-- La première version (20260904) castait chaque product_id du panier en `uuid`
-- (`(v_item->>'product_id')::uuid`). Or `public.lmb_products.id` N'EST PAS un
-- uuid : la table est historique et son `id` contient des valeurs courtes
-- ("1", "10", "15", ...). Résultat au moment d'une vraie vente :
--
--   invalid input syntax for type uuid: "15"
--   at createSaleWithCustomer (sales.ts:104)
--
-- CORRECTION
-- ----------
-- On ne force plus aucun cast vers uuid. L'identifiant produit est traité comme
-- du texte, et la comparaison se fait sur `id::text = $1`. Ce cast de la colonne
-- vers `text` fonctionne quel que soit le type réel de `lmb_products.id`
-- (text, bigint, integer, uuid...) : la fonction devient indépendante du schéma
-- historique.
--
-- Idempotente : CREATE OR REPLACE + REVOKE/GRANT rejouables.
-- Signature inchangée -> pas de DROP nécessaire.
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
  v_product_id text;
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
    v_product_id := nullif(v_item->>'product_id', '');
    IF v_product_id IS NULL THEN
      v_product_id := nullif(v_item->>'id', '');
    END IF;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0)::integer;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Article sans product_id valide dans le panier: %', v_item;
    END IF;
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT name, coalesce(%I, 0) FROM public.lmb_products WHERE id::text = $1 FOR UPDATE',
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
  --    portées par p_sale.
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
    v_product_id := nullif(v_item->>'product_id', '');
    IF v_product_id IS NULL THEN
      v_product_id := nullif(v_item->>'id', '');
    END IF;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0)::integer;
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.lmb_products SET %I = coalesce(%I, 0) - $1 WHERE id::text = $2',
      v_stock_col, v_stock_col
    )
    USING v_qty, v_product_id;
  END LOOP;

  RETURN v_sale;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_sale_and_decrement_stock(jsonb, jsonb, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_sale_and_decrement_stock(jsonb, jsonb, text) TO authenticated;
