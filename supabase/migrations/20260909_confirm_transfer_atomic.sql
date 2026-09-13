-- Migration: confirm_transfer(p_transfer_number) — confirmation ATOMIQUE d'un colis
-- Generated: 2026-09-09
--
-- CONTEXTE
-- --------
-- `confirmTransfer()` (lib/services/inventory.ts) confirmait un colis multi-produits
-- (plusieurs lignes de `lmb_transfers` partageant le même `transfer_number`) via
-- PLUSIEURS requêtes JS successives : lecture, N x UPDATE lmb_products, puis
-- UPDATE lmb_transfers. Aucune transaction réelle : si une écriture échoue au
-- milieu, une partie des mouvements de stock est appliquée et l'autre non, sans
-- rollback possible.
--
-- CORRECTION
-- ----------
-- Toute la logique passe dans UNE fonction Postgres = UNE transaction. En cas
-- d'exception à n'importe quelle étape, TOUT est annulé automatiquement.
--
-- Même principe de sécurité que record_sale_and_decrement_stock (20260906) :
--   SECURITY DEFINER + search_path = public
--   REVOKE EXECUTE FROM anon, public ; GRANT EXECUTE TO authenticated.
--
-- SCHÉMA RÉEL de lmb_transfers (une ligne = un produit) :
--   ref_number (UNIQUE, 1 par ligne), transfer_number (regroupement du colis),
--   from_city, to_city, product_sku, product_name, quantity, status, confirmed_at,
--   items (miroir jsonb [{productId, qty}]).
-- lmb_transfers ne stocke PAS de product_id : le lien vers lmb_products se fait
-- par `product_sku` (= lmb_products.sku), avec repli sur items[0].productId.
--
-- Idempotente : CREATE OR REPLACE + REVOKE/GRANT rejouables.
-- Ne modifie AUCUNE migration déjà appliquée.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_number text)
RETURNS SETOF public.lmb_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now         timestamptz := now();
  v_row         public.lmb_transfers;
  v_bad         text;
  v_from_city   text;
  v_to_city     text;
  v_from_col    text;
  v_to_col      text;
  v_pid         text;
  v_qty         integer;
  v_avail       integer;
  v_name        text;
  v_count       integer := 0;
BEGIN
  -- 0. Rien à confirmer ?
  PERFORM 1 FROM public.lmb_transfers WHERE transfer_number = p_transfer_number;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun transfert avec le numéro %.', p_transfer_number;
  END IF;

  -- 1. Verrou de toutes les lignes du colis (empêche toute confirmation concurrente).
  PERFORM 1
  FROM public.lmb_transfers
  WHERE transfer_number = p_transfer_number
  FOR UPDATE;

  -- 2. Refus TOTAL si une ligne est déjà confirmée ou annulée (on nomme lesquelles).
  SELECT string_agg(ref_number, ', ' ORDER BY ref_number)
    INTO v_bad
  FROM public.lmb_transfers
  WHERE transfer_number = p_transfer_number
    AND upper(coalesce(status, '')) IN ('CONFIRMED', 'RECEIVED', 'RECU', 'REÇU', 'DONE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'Confirmation refusée : ligne(s) déjà confirmée(s) dans le colis % : %. Aucune modification appliquée.',
      p_transfer_number, v_bad;
  END IF;

  SELECT string_agg(ref_number, ', ' ORDER BY ref_number)
    INTO v_bad
  FROM public.lmb_transfers
  WHERE transfer_number = p_transfer_number
    AND upper(coalesce(status, '')) IN ('CANCELLED', 'CANCELED', 'ANNULE', 'ANNULÉ');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'Confirmation refusée : ligne(s) annulée(s) dans le colis % : %. Aucune modification appliquée.',
      p_transfer_number, v_bad;
  END IF;

  -- 3 + 4. Pour chaque ligne : résolution produit, contrôle de stock, mouvement.
  --        Tout se passe dans la même transaction -> une exception annule tout.
  FOR v_row IN
    SELECT * FROM public.lmb_transfers
    WHERE transfer_number = p_transfer_number
    ORDER BY ref_number
  LOOP
    v_count := v_count + 1;

    v_from_city := upper(trim(coalesce(v_row.from_city, v_row.source_location, '')));
    v_to_city   := upper(trim(coalesce(v_row.to_city,   v_row.destination_location, '')));
    v_qty       := coalesce(v_row.quantity, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Colis % : quantité invalide (%) sur la ligne % (%).',
        p_transfer_number, v_row.quantity, v_row.ref_number, coalesce(v_row.product_name, v_row.product_sku);
    END IF;

    -- ville -> colonne de stock
    v_from_col := CASE v_from_city
                    WHEN 'DAKAR'   THEN 'stock_dakar'
                    WHEN 'ABIDJAN' THEN 'stock_abidjan'
                    WHEN 'RESERVE' THEN 'stock_reserve'
                    ELSE NULL END;
    v_to_col   := CASE v_to_city
                    WHEN 'DAKAR'   THEN 'stock_dakar'
                    WHEN 'ABIDJAN' THEN 'stock_abidjan'
                    WHEN 'RESERVE' THEN 'stock_reserve'
                    ELSE NULL END;
    IF v_from_col IS NULL OR v_to_col IS NULL THEN
      RAISE EXCEPTION 'Colis % : ville inconnue sur la ligne % (from="%", to="%"). Attendu DAKAR / ABIDJAN / RESERVE.',
        p_transfer_number, v_row.ref_number, v_from_city, v_to_city;
    END IF;

    -- résolution du produit : par SKU, repli sur items[0].productId
    SELECT id::text INTO v_pid
    FROM public.lmb_products
    WHERE sku = v_row.product_sku
    LIMIT 1;

    IF v_pid IS NULL THEN
      v_pid := nullif(v_row.items -> 0 ->> 'productId', '');
    END IF;

    IF v_pid IS NULL THEN
      RAISE EXCEPTION 'Colis % : produit introuvable pour la ligne % (SKU "%").',
        p_transfer_number, v_row.ref_number, coalesce(v_row.product_sku, '?');
    END IF;

    -- verrou + lecture du stock source réel
    EXECUTE format(
      'SELECT name, coalesce(%I, 0) FROM public.lmb_products WHERE id::text = $1 FOR UPDATE',
      v_from_col
    )
    INTO v_name, v_avail
    USING v_pid;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Colis % : produit introuvable (id=%) pour la ligne %.',
        p_transfer_number, v_pid, v_row.ref_number;
    END IF;

    IF v_avail < v_qty THEN
      RAISE EXCEPTION
        'Colis % : stock insuffisant pour "%" à % — % demandé(s), % disponible(s). Aucun mouvement appliqué.',
        p_transfer_number, v_name, v_from_city, v_qty, v_avail;
    END IF;

    -- mouvement : - from_city, + to_city
    EXECUTE format(
      'UPDATE public.lmb_products SET %I = coalesce(%I, 0) - $1, %I = coalesce(%I, 0) + $1 WHERE id::text = $2',
      v_from_col, v_from_col, v_to_col, v_to_col
    )
    USING v_qty, v_pid;
  END LOOP;

  -- 5. Toutes les lignes du colis -> CONFIRMED, même horodatage.
  UPDATE public.lmb_transfers
     SET status = 'CONFIRMED',
         confirmed_at = v_now
   WHERE transfer_number = p_transfer_number;

  -- 6. Lignes confirmées.
  RETURN QUERY
    SELECT * FROM public.lmb_transfers
    WHERE transfer_number = p_transfer_number
    ORDER BY ref_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_transfer(text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.confirm_transfer(text) TO authenticated;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--   SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'confirm_transfer';
-- =====================================================================
