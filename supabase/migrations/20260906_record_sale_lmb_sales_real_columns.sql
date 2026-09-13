-- Migration: record_sale_and_decrement_stock — INSERT lmb_sales piloté par le
--            VRAI schéma de la table (fin des noms de colonnes devinés)
-- Generated: 2026-09-06
--
-- CONTEXTE
-- --------
-- 20260904 / 20260905 inséraient dans lmb_sales des colonnes DEVINÉES
-- (total_amount, payment_method, store_code, created_at, metadata). La table
-- lmb_sales est historique : au moins `total_amount` n'existe pas. Erreur en
-- caisse :
--
--   column "total_amount" of relation "lmb_sales" does not exist
--   at createSaleWithCustomer (sales.ts)
--
-- Impossible de lire information_schema hors de la base (clé anon + RLS). Cette
-- migration retourne donc le problème : au lieu de deviner, la fonction lit
-- elle-même `information_schema.columns` AU MOMENT DE L'APPEL et construit un
-- INSERT dynamique à partir des colonnes RÉELLEMENT présentes sur lmb_sales.
--
-- PRINCIPE
-- --------
--  * p_sale porte des clés CANONIQUES (total_amount, subtotal_xof, discount_xof,
--    payment_method, payment_reference, store_code/store_name, customer_id,
--    cashier_name, receipt_number, notes, created_at, items_json, metadata).
--  * Pour chaque valeur canonique non nulle, la fonction cherche le PREMIER nom
--    de colonne réellement présent dans lmb_sales parmi une liste de synonymes
--    (fr/en), et ne l'insère que s'il existe. Aucun nom n'est supposé.
--  * Avant l'INSERT, elle vérifie qu'aucune colonne NOT NULL sans DEFAULT (et
--    non identity / non générée) ne reste non renseignée. Si c'est le cas ->
--    RAISE EXCEPTION qui NOMME ces colonnes, au lieu d'improviser une valeur.
--
-- Le contrôle de stock + le décrément (avec id::text, cf. 20260905) sont
-- conservés à l'identique.
--
-- Idempotente : CREATE OR REPLACE + REVOKE/GRANT rejouables. Signature
-- inchangée -> pas de DROP.
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

  v_cols text[] := ARRAY[]::text[];
  v_vals text[] := ARRAY[]::text[];
  v_used text[] := ARRAY[]::text[];
  v_col  text;
  v_missing text;
  r record;
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

  -- 3. INSERT dynamique dans lmb_sales, appuyé sur les colonnes RÉELLES.
  --    t(canon, cands[], kind, val) : val = valeur canonique extraite de p_sale,
  --    cands = noms de colonnes possibles par ordre de préférence.
  FOR r IN
    SELECT * FROM (VALUES
      ('total',
        ARRAY['total_amount','total_amount_xof','total_xof','montant_total','amount','total','grand_total','net_total'],
        'num',
        coalesce(p_sale->>'total_amount', p_sale->>'total_amount_xof', p_sale->>'total_xof')),
      ('subtotal',
        ARRAY['subtotal_xof','subtotal','sous_total','subtotal_amount','montant_ht','gross_total'],
        'num',
        coalesce(p_sale->>'subtotal_xof', p_sale->>'subtotal')),
      ('discount',
        ARRAY['discount_xof','discount','remise','discount_amount','montant_remise','rebate_xof'],
        'num',
        coalesce(p_sale->>'discount_xof', p_sale->>'discount')),
      ('payment_method',
        ARRAY['payment_method','payment_mode','mode_paiement','moyen_paiement','payment_type','paiement'],
        'text',
        p_sale->>'payment_method'),
      ('payment_reference',
        ARRAY['payment_reference','payment_ref','reference_paiement','transaction_reference','payment_txn_ref','ref_paiement'],
        'text',
        p_sale->>'payment_reference'),
      ('store',
        ARRAY['store_code','store_name','store','boutique','magasin','shop_code','shop','point_of_sale'],
        'text',
        coalesce(p_sale->>'store_code', p_sale->>'store_name')),
      ('customer',
        ARRAY['customer_id','client_id','id_client','customer','client'],
        'text',
        p_sale->>'customer_id'),
      ('cashier',
        ARRAY['cashier_name','cashier','caissier','vendeur','seller_name','staff_name','created_by','user_name','agent'],
        'text',
        p_sale->>'cashier_name'),
      ('created_at',
        ARRAY['created_at','sale_date','date','created','date_vente','sold_at','inserted_at'],
        'ts',
        p_sale->>'created_at'),
      ('receipt',
        ARRAY['receipt_number','receipt_no','receipt','numero_recu','sale_number','invoice_number','ticket_number','reference','ref'],
        'text',
        p_sale->>'receipt_number'),
      ('notes',
        ARRAY['notes','note','comment','commentaire','remarks','observation'],
        'text',
        p_sale->>'notes'),
      ('items',
        ARRAY['items_json','items','line_items','articles','products','cart','details','lignes','cart_items'],
        'json',
        coalesce(p_sale->>'items_json', p_sale->>'items')),
      ('metadata',
        ARRAY['metadata','meta','extra','data','payload','infos','extras'],
        'json',
        coalesce(p_sale->>'metadata', '{}'))
    ) AS t(canon, cands, kind, val)
  LOOP
    IF r.val IS NULL THEN
      CONTINUE;
    END IF;

    SELECT c.column_name INTO v_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name  = 'lmb_sales'
      AND c.column_name = ANY (r.cands)
      AND c.column_name <> ALL (v_used)
    ORDER BY array_position(r.cands, c.column_name)
    LIMIT 1;

    IF v_col IS NULL THEN
      CONTINUE;
    END IF;

    v_used := v_used || v_col;
    v_cols := v_cols || quote_ident(v_col);
    v_vals := v_vals || (
      CASE r.kind
        WHEN 'num'  THEN (coalesce(nullif(r.val, '')::numeric, 0))::text
        WHEN 'ts'   THEN quote_literal(coalesce(r.val::timestamptz, now()))
        WHEN 'json' THEN quote_literal(r.val) || '::jsonb'
        ELSE quote_literal(r.val)
      END
    );
  END LOOP;

  IF array_length(v_cols, 1) IS NULL THEN
    RAISE EXCEPTION
      'record_sale_and_decrement_stock : aucune colonne de lmb_sales n''a pu être appariée avec p_sale (schéma inattendu).';
  END IF;

  -- Colonnes obligatoires (NOT NULL, sans DEFAULT, non identity, non générées)
  -- qu'on ne sait pas renseigner -> on refuse au lieu d'improviser.
  SELECT string_agg(c.column_name, ', ' ORDER BY c.ordinal_position)
    INTO v_missing
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name  = 'lmb_sales'
    AND c.is_nullable = 'NO'
    AND c.column_default IS NULL
    AND c.is_identity = 'NO'
    AND c.is_generated = 'NEVER'
    AND c.column_name <> ALL (v_used);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'lmb_sales exige des colonnes NOT NULL non fournies par p_sale : %. Ajoutez-les dans le p_sale de sales.ts (ou donnez-leur un DEFAULT en base).',
      v_missing;
  END IF;

  EXECUTE
    'INSERT INTO public.lmb_sales (' || array_to_string(v_cols, ', ') || ') ' ||
    'VALUES (' || array_to_string(v_vals, ', ') || ') RETURNING *'
  INTO v_sale;

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
