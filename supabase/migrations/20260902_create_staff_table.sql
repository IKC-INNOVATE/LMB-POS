-- Migration: Table des employés (lmb_staff) + authentification par rôle
-- Generated: 2026-09-02
--
-- CONTEXTE
-- --------
-- La migration 20260901_enable_rls.sql a activé la RLS partout et donné un
-- accès complet TRANSITOIRE au rôle "authenticated" (aucun employé n'existait
-- encore). Cette migration crée la table qui relie un compte Supabase Auth
-- (auth.users) à un employé LMB : son nom, son rôle et sa boutique.
--
-- Rôles :
--   CAISSIER  : caisse uniquement, pas d'accès aux marges / achats / compta.
--   GERANT    : accès complet à l'administration d'une boutique.
--   DIRECTION : supervise les deux boutiques (store_code peut être NULL).
--
-- Cette migration est idempotente : elle peut être rejouée sans erreur.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lmb_staff (
  id         uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  role       text NOT NULL CHECK (role IN ('CAISSIER', 'GERANT', 'DIRECTION')),
  store_code text,                       -- boutique assignée ; NULL = DIRECTION (supervise tout)
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lmb_staff IS
  'Employés LMB. Une ligne par compte Supabase Auth. Le rôle pilote les droits d''accès.';

-- Rattrapage idempotent : si une tentative précédente a créé la table avec une
-- colonne "active", on la renomme ; si la colonne manque tout court, on l'ajoute.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lmb_staff' AND column_name = 'active'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lmb_staff' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.lmb_staff RENAME COLUMN active TO is_active;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lmb_staff' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.lmb_staff ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. FONCTION UTILITAIRE : l'utilisateur courant est-il DIRECTION ?
--    SECURITY DEFINER => elle contourne la RLS et évite toute récursion
--    de policy sur lmb_staff.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_staff_is_direction()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lmb_staff s
    WHERE s.id = auth.uid()
      AND s.role = 'DIRECTION'
      AND s.is_active
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_staff_is_direction() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.current_staff_is_direction() TO authenticated;

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.lmb_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmb_staff FORCE ROW LEVEL SECURITY;

-- anon : aucun accès.
REVOKE ALL ON public.lmb_staff FROM anon;

-- On retire la policy transitoire "tout authenticated" éventuellement posée
-- par la migration précédente (au cas où la table aurait déjà existé).
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_staff;

-- 3a. Un employé authentifié lit uniquement SA propre ligne.
DROP POLICY IF EXISTS "staff_read_own" ON public.lmb_staff;
CREATE POLICY "staff_read_own" ON public.lmb_staff
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 3b. La DIRECTION lit ET modifie toutes les lignes.
DROP POLICY IF EXISTS "direction_full_access" ON public.lmb_staff;
CREATE POLICY "direction_full_access" ON public.lmb_staff
  FOR ALL
  TO authenticated
  USING (public.current_staff_is_direction())
  WITH CHECK (public.current_staff_is_direction());

-- =====================================================================
-- CRÉATION DU PREMIER COMPTE DIRECTION (À FAIRE MANUELLEMENT)
-- ---------------------------------------------------------------------
-- 1. Dashboard Supabase > Authentication > Users > "Add user"
--    - Email + mot de passe, cocher "Auto Confirm User".
--    - Copier l'UUID du user créé.
-- 2. Dashboard Supabase > SQL Editor, exécuter (en remplaçant les valeurs) :
--
--    INSERT INTO public.lmb_staff (id, full_name, role, store_code, is_active)
--    VALUES ('<UUID_DU_USER>', 'Nom Prénom', 'DIRECTION', NULL, true);
--
-- 3. Se connecter dans l'app sur /login avec cet email + mot de passe.
-- =====================================================================
