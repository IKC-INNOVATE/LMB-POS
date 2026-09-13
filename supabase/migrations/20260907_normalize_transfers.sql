-- Migration: unification du format de `lmb_transfers`
-- Generated: 2026-09-07
--
-- CONTEXTE (constat d'audit #5)
-- ----------------------------
-- `lmb_transfers` a été alimentée par DEUX chemins de code au format incompatible :
--
--   A. lib/services/inventory.ts  (FORMAT CANONIQUE, lu par confirmTransfer())
--        source_location      text     'DAKAR' | 'ABIDJAN' | 'RESERVE'
--        destination_location text
--        items                jsonb    [{ "productId": "...", "qty": 3 }]
--        status               text     'PENDING' | 'CONFIRMED' | 'CANCELLED'
--        transfer_number, created_by, created_at, confirmed_at
--
--   B. app/admin/page.tsx (handleValidateAndSendShipment)  — FORMAT ADMIN
--        origin_store         text     'ABIDJAN'
--        destination_store    text     'DAKAR'
--        items_json           jsonb    [{ "productId": "...", "quantity_sent": 3, "quantity_received": 0 }]
--        status               text     'EN_TRANSIT'
--        product_name, product_sku, shipping_fee_xof, tracking_reference, sent_by
--
-- Résultat : confirmTransfer() plantait (ou ne faisait rien) sur les transferts
-- créés depuis l'admin, car source_location / destination_location / items y
-- étaient NULL.
--
-- DÉCISION
-- --------
-- Format canonique retenu = A (celui que confirmTransfer() sait déjà traiter).
-- Le code applicatif ne fait plus qu'UNE écriture, via createTransfer().
-- Cette migration :
--   1. garantit la présence des colonnes canoniques + `metadata`;
--   2. RÉ-ÉCRIT les lignes historiques au format B vers le format A
--      (aucune donnée supprimée : les colonnes B sont conservées, et leur
--       contenu est recopié dans `metadata`);
--   3. marque `metadata.needs_review = true` sur les lignes non convertibles
--      automatiquement (au lieu de les perdre ou de deviner).
--
-- Idempotente : ne convertit que les lignes encore incohérentes.
-- Ne modifie AUCUNE migration déjà appliquée.
-- =====================================================================

-- 1. Colonnes canoniques + metadata (défensif : la table peut être partielle)
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS transfer_number      text;
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS source_location      text;
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS destination_location text;
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS items                jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS status               text  DEFAULT 'PENDING';
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS created_by           text;
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS created_at           timestamptz DEFAULT now();
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS confirmed_at         timestamptz;
ALTER TABLE public.lmb_transfers ADD COLUMN IF NOT EXISTS metadata             jsonb DEFAULT '{}'::jsonb;

-- 2. Normalisation des données existantes.
DO $$
DECLARE
  has_origin      boolean;
  has_destination boolean;
  has_items_json  boolean;
  has_pname       boolean;
  has_psku        boolean;
  has_fee         boolean;
  has_track       boolean;
  has_sentby      boolean;
  legacy_cols     text := '';
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lmb_transfers' AND column_name='origin_store')        INTO has_origin;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lmb_transfers' AND column_name='destination_store')   INTO has_destination;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lmb_transfers' AND column_name='items_json')          INTO has_items_json;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lmb_transfers' AND column_name='product_name')        INTO has_pname;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lmb_transfers' AND column_name='product_sku')         INTO has_psku;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lmb_transfers' AND column_name='shipping_fee_xof')    INTO has_fee;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lmb_transfers' AND column_name='tracking_reference')  INTO has_track;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lmb_transfers' AND column_name='sent_by')             INTO has_sentby;

  -- 2a. Statuts non canoniques -> statut canonique
  UPDATE public.lmb_transfers
     SET status = CASE
                    WHEN upper(coalesce(status,'')) IN ('EN_TRANSIT','EN TRANSIT','SENT','SHIPPED','PENDING') THEN 'PENDING'
                    WHEN upper(coalesce(status,'')) IN ('RECEIVED','RECU','REÇU','CONFIRMED','DONE')          THEN 'CONFIRMED'
                    WHEN upper(coalesce(status,'')) IN ('CANCELLED','CANCELED','ANNULE','ANNULÉ')             THEN 'CANCELLED'
                    ELSE 'PENDING'
                  END
   WHERE status IS NULL
      OR upper(status) NOT IN ('PENDING','CONFIRMED','CANCELLED');

  -- 2b. origin_store / destination_store -> source_location / destination_location
  IF has_origin AND has_destination THEN
    EXECUTE $q$
      UPDATE public.lmb_transfers
         SET source_location      = coalesce(source_location,      upper(nullif(trim(origin_store::text), ''))),
             destination_location = coalesce(destination_location, upper(nullif(trim(destination_store::text), '')))
       WHERE source_location IS NULL OR destination_location IS NULL
    $q$;
  END IF;

  -- 2c. items_json ([{productId, quantity_sent}]) -> items ([{productId, qty}])
  IF has_items_json THEN
    EXECUTE $q$
      UPDATE public.lmb_transfers t
         SET items = sub.conv
        FROM (
          SELECT x.id,
                 jsonb_agg(
                   jsonb_build_object(
                     'productId', coalesce(e->>'productId', e->>'product_id', e->>'id'),
                     'qty', coalesce(
                              nullif(e->>'qty','')::numeric,
                              nullif(e->>'quantity_sent','')::numeric,
                              nullif(e->>'quantity','')::numeric,
                              0
                            )::int
                   )
                 ) AS conv
            FROM public.lmb_transfers x
            CROSS JOIN LATERAL jsonb_array_elements(x.items_json) e
           WHERE x.items_json IS NOT NULL
             AND jsonb_typeof(x.items_json) = 'array'
             AND (x.items IS NULL OR x.items = '[]'::jsonb)
           GROUP BY x.id
        ) sub
       WHERE t.id = sub.id
    $q$;
  END IF;

  -- 2d. Recopie des colonnes descriptives du format admin dans metadata
  --     (aucune suppression : la donnée d'origine reste dans sa colonne).
  IF has_pname THEN legacy_cols := legacy_cols || $q$ 'product_name', product_name,$q$;        END IF;
  IF has_psku  THEN legacy_cols := legacy_cols || $q$ 'product_sku', product_sku,$q$;          END IF;
  IF has_fee   THEN legacy_cols := legacy_cols || $q$ 'shipping_fee_xof', shipping_fee_xof,$q$; END IF;
  IF has_track THEN legacy_cols := legacy_cols || $q$ 'tracking_reference', tracking_reference,$q$; END IF;
  IF has_sentby THEN legacy_cols := legacy_cols || $q$ 'sent_by', sent_by,$q$;                 END IF;

  IF length(legacy_cols) > 0 THEN
    EXECUTE format($q$
      UPDATE public.lmb_transfers
         SET metadata = jsonb_strip_nulls(
                          coalesce(metadata, '{}'::jsonb)
                          || jsonb_build_object(%s 'legacy_normalized', true)
                        )
       WHERE (metadata IS NULL OR NOT (metadata ? 'legacy_normalized'))
    $q$, legacy_cols);
  END IF;

  -- 2e. Lignes non convertibles automatiquement -> marquées pour revue manuelle,
  --     jamais supprimées.
  UPDATE public.lmb_transfers
     SET metadata = coalesce(metadata, '{}'::jsonb) || '{"needs_review": true}'::jsonb
   WHERE source_location IS NULL
      OR destination_location IS NULL
      OR items IS NULL
      OR items = '[]'::jsonb;
END $$;

-- 3. Filet de sécurité : plus aucune ligne "items" nulle.
UPDATE public.lmb_transfers SET items = '[]'::jsonb WHERE items IS NULL;

-- =====================================================================
-- VÉRIFICATION MANUELLE (à lancer après la migration, ne modifie rien) :
--
--   -- transferts à revoir manuellement :
--   SELECT id, transfer_number, source_location, destination_location, status, metadata
--   FROM public.lmb_transfers
--   WHERE metadata ? 'needs_review';
--
--   -- répartition des statuts (doit être PENDING / CONFIRMED / CANCELLED only) :
--   SELECT status, count(*) FROM public.lmb_transfers GROUP BY status;
-- =====================================================================
