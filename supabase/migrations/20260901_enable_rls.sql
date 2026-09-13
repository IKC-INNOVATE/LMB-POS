-- Migration: Activation de la Row Level Security (RLS) sur toutes les tables métier
-- Generated: 2026-09-01
--
-- CONTEXTE
-- --------
-- L'application se connecte à Supabase avec la clé publique
-- NEXT_PUBLIC_SUPABASE_ANON_KEY (rôle "anon"), visible dans le navigateur.
-- Aucune table n'avait la RLS activée : cette clé donnait donc un accès direct
-- en lecture ET en écriture à toute la base à quiconque la récupérait.
--
-- OBJECTIF DE CETTE MIGRATION (volontairement limité)
-- --------------------------------------------------
--   1. Activer la RLS sur toutes les tables métier.
--   2. Couper tout accès du rôle "anon" aux données sensibles
--      (ventes, clients, caisses, dépenses, pointage, achats...).
--   3. Laisser uniquement une lecture publique (SELECT) sur le catalogue
--      produit (lmb_products) et les promotions (lmb_promotions).
--   4. Donner, À TITRE TRANSITOIRE, un accès complet (lecture + écriture)
--      au rôle "authenticated".
--
-- POLITIQUE TEMPORAIRE
-- -------------------
-- Il n'existe pas encore de système d'authentification par employé.
-- Personne n'utilise donc actuellement le rôle "authenticated".
-- Les policies "authenticated = tout autoriser" ci-dessous sont une étape
-- de transition. Elles SERONT AFFINÉES PAR RÔLE (CAISSIER / GERANT / DIRECTION)
-- dans une tâche ultérieure, une fois l'authentification employé en place.
--
-- Cette migration est idempotente : elle peut être rejouée sans erreur.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABLES SENSIBLES : RLS activée, AUCUNE policy pour "anon",
--    accès complet transitoire pour "authenticated".
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  sensitive_tables text[] := ARRAY[
    'lmb_sales',
    'lmb_customers',
    'lmb_customer_orders',
    'lmb_customer_loyalty_events',
    'lmb_registers',
    'lmb_register_expenses',
    'lmb_expenses',
    'lmb_attendance',
    'lmb_inventory_audits',
    'lmb_purchase_orders',
    'lmb_suppliers',
    'lmb_transfers',
    'lmb_audit_logs',
    'inventory_reports'
  ];
BEGIN
  FOREACH t IN ARRAY sensitive_tables LOOP
    -- On ne traite que les tables qui existent réellement dans la base.
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table publique % absente, ignorée.', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);

    -- Révocation explicite de tout privilège direct pour anon.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);

    -- Nettoyage d'une éventuelle policy transitoire déjà posée.
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all_access" ON public.%I;', t);

    -- Policy transitoire : accès complet pour authenticated. À AFFINER PAR RÔLE.
    EXECUTE format($f$
      CREATE POLICY "authenticated_all_access" ON public.%I
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    $f$, t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 2. TABLES À LECTURE PUBLIQUE ACCEPTABLE : lmb_products, lmb_promotions
--    RLS activée.
--    anon : SELECT uniquement (jamais INSERT / UPDATE / DELETE).
--    authenticated : accès complet transitoire (à affiner par rôle).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  public_read_tables text[] := ARRAY[
    'lmb_products',
    'lmb_promotions'
  ];
BEGIN
  FOREACH t IN ARRAY public_read_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table publique % absente, ignorée.', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);

    -- anon : on retire l'écriture, on ne garde que la lecture.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon;', t);

    EXECUTE format('DROP POLICY IF EXISTS "anon_read_only" ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY "anon_read_only" ON public.%I
        FOR SELECT
        TO anon
        USING (true);
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all_access" ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY "authenticated_all_access" ON public.%I
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    $f$, t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3. FONCTION RPC : increment_loyalty_points
--    Elle est SECURITY DEFINER et modifie lmb_customers.
--    On interdit son exécution au rôle anon (elle ne doit être
--    appelable que par un employé authentifié, plus tard).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'increment_loyalty_points'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.increment_loyalty_points(uuid, int, numeric) FROM anon, public;
    GRANT EXECUTE ON FUNCTION public.increment_loyalty_points(uuid, int, numeric) TO authenticated;
  END IF;
END $$;


-- =====================================================================
-- RÉSULTAT ATTENDU APRÈS APPLICATION
-- ---------------------------------
-- Avec la clé anon (navigateur / curl) :
--   - SELECT sur lmb_products / lmb_promotions  -> OK (lecture catalogue)
--   - toute autre requête (SELECT lmb_customers, lmb_sales, INSERT, ...)
--     -> refusée (tableau vide ou erreur 401/403 selon le cas)
-- Avec la clé service_role (serveur uniquement, jamais dans le navigateur) :
--   - accès complet, la RLS est ignorée.
-- =====================================================================
