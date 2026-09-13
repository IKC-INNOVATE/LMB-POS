-- Migration: Alignement de la table lmb_staff préexistante sur le schéma attendu par le code
-- Generated: 2026-09-03
--
-- CONTEXTE
-- --------
-- Une table public.lmb_staff existait déjà en production, créée hors de nos
-- migrations, avec des noms de colonnes différents de ceux que lit le code
-- (lib/services/auth.ts -> select id, full_name, role, store_code, is_active, created_at).
-- Symptôme : PostgREST renvoie 400 "column lmb_staff.full_name does not exist".
--
-- OBJECTIF
-- --------
-- Renommer / ajouter les colonnes manquantes SANS DROP TABLE (la ligne du
-- compte DIRECTION déjà insérée doit être conservée).
--
-- Cette migration est idempotente et défensive : pour chaque colonne cible,
-- si elle existe déjà -> on ne touche à rien ;
-- sinon si un alias connu existe -> RENAME ;
-- sinon -> ADD COLUMN avec une valeur par défaut sûre.
-- =====================================================================

DO $$
DECLARE
  -- Pour chaque colonne cible : la liste des alias hérités possibles.
  targets jsonb := jsonb_build_object(
    'full_name',  jsonb_build_array('name', 'nom', 'fullname', 'employee_name', 'nom_complet', 'prenom_nom', 'display_name'),
    'role',       jsonb_build_array('poste', 'fonction', 'type', 'role_name', 'user_role'),
    'store_code', jsonb_build_array('store', 'boutique', 'magasin', 'shop_code', 'store_id', 'code_boutique'),
    'is_active',  jsonb_build_array('active', 'actif', 'enabled', 'is_enabled'),
    'created_at', jsonb_build_array('inserted_at', 'date_creation', 'created')
  );
  target  text;
  aliases jsonb;
  alias   text;
  found_alias text;
BEGIN
  IF to_regclass('public.lmb_staff') IS NULL THEN
    RAISE EXCEPTION 'public.lmb_staff est absente : lance d''abord 20260902_create_staff_table.sql';
  END IF;

  FOR target, aliases IN SELECT * FROM jsonb_each(targets) LOOP
    -- 1. La colonne cible existe déjà ? -> rien à faire.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lmb_staff' AND column_name = target
    ) THEN
      CONTINUE;
    END IF;

    -- 2. Un alias hérité existe ? -> on le renomme.
    found_alias := NULL;
    FOR alias IN SELECT jsonb_array_elements_text(aliases) LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lmb_staff' AND column_name = alias
      ) THEN
        found_alias := alias;
        EXIT;
      END IF;
    END LOOP;

    IF found_alias IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.lmb_staff RENAME COLUMN %I TO %I;', found_alias, target);
      RAISE NOTICE 'lmb_staff.% renommée depuis %', target, found_alias;
      CONTINUE;
    END IF;

    -- 3. Rien trouvé -> on ajoute la colonne avec un défaut sûr.
    IF target = 'full_name' THEN
      ALTER TABLE public.lmb_staff ADD COLUMN full_name text NOT NULL DEFAULT 'À COMPLÉTER';
    ELSIF target = 'role' THEN
      ALTER TABLE public.lmb_staff ADD COLUMN role text NOT NULL DEFAULT 'CAISSIER';
    ELSIF target = 'store_code' THEN
      ALTER TABLE public.lmb_staff ADD COLUMN store_code text;
    ELSIF target = 'is_active' THEN
      ALTER TABLE public.lmb_staff ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    ELSIF target = 'created_at' THEN
      ALTER TABLE public.lmb_staff ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    END IF;
    RAISE NOTICE 'lmb_staff.% ajoutée (aucun alias trouvé)', target;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Normalisation des valeurs de "role" (au cas où l'ancienne table
-- stockait "caissier", "manager", "admin"...) puis (re)pose du CHECK.
-- ---------------------------------------------------------------------
UPDATE public.lmb_staff
SET role = CASE upper(trim(role))
  WHEN 'CAISSIER'  THEN 'CAISSIER'
  WHEN 'CASHIER'   THEN 'CAISSIER'
  WHEN 'VENDEUR'   THEN 'CAISSIER'
  WHEN 'GERANT'    THEN 'GERANT'
  WHEN 'GÉRANT'    THEN 'GERANT'
  WHEN 'MANAGER'   THEN 'GERANT'
  WHEN 'DIRECTION' THEN 'DIRECTION'
  WHEN 'DIRECTEUR' THEN 'DIRECTION'
  WHEN 'ADMIN'     THEN 'DIRECTION'
  WHEN 'DG'        THEN 'DIRECTION'
  ELSE upper(trim(role))
END
WHERE role IS DISTINCT FROM upper(trim(role))
   OR role NOT IN ('CAISSIER', 'GERANT', 'DIRECTION');

ALTER TABLE public.lmb_staff DROP CONSTRAINT IF EXISTS lmb_staff_role_check;
ALTER TABLE public.lmb_staff
  ADD CONSTRAINT lmb_staff_role_check CHECK (role IN ('CAISSIER', 'GERANT', 'DIRECTION'));

-- Défaut "À COMPLÉTER" retiré après coup : il ne servait qu'au ADD COLUMN NOT NULL.
ALTER TABLE public.lmb_staff ALTER COLUMN full_name DROP DEFAULT;

-- ---------------------------------------------------------------------
-- Re-vérifie la RLS et les policies (identiques à 20260902, idempotent).
-- ---------------------------------------------------------------------
ALTER TABLE public.lmb_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmb_staff FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.lmb_staff FROM anon;

DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_staff;

DROP POLICY IF EXISTS "staff_read_own" ON public.lmb_staff;
CREATE POLICY "staff_read_own" ON public.lmb_staff
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "direction_full_access" ON public.lmb_staff;
CREATE POLICY "direction_full_access" ON public.lmb_staff
  FOR ALL TO authenticated
  USING (public.current_staff_is_direction())
  WITH CHECK (public.current_staff_is_direction());

-- ---------------------------------------------------------------------
-- CONTRÔLE FINAL : cette requête doit renvoyer 6 lignes, une par colonne.
-- ---------------------------------------------------------------------
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='lmb_staff'
--   AND column_name IN ('id','full_name','role','store_code','is_active','created_at');
