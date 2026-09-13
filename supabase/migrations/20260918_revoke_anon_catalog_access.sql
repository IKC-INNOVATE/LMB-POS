-- Migration : suppression de l'accès public (anon) mort sur lmb_products et lmb_promotions
--
-- CONTEXTE
-- --------
-- Deuxième audit (29/08/2026), constat critique #3 : `lmb_products` et
-- `lmb_promotions` étaient en lecture publique pour le rôle "anon" depuis
-- 20260901_enable_rls.sql, pensée à l'origine pour un futur "catalogue client
-- public". Vérification faite le 29/08/2026 : AUCUNE page de l'application
-- n'est accessible sans connexion (toutes derrière AuthGuard, y compris la
-- caisse "/") — cet accès public n'est utilisé par rien.
--
-- Problème concret que ça causait : les colonnes cost_price_xof et
-- floor_price_xof, ajoutées après coup sur lmb_products (Tâche 2.4), se
-- retrouvaient elles aussi lisibles par n'importe qui via la clé anon
-- (visible dans le navigateur), sans qu'aucune page ne s'en serve.
--
-- Cette migration retire uniquement l'accès "anon". Le rôle "authenticated"
-- garde son accès complet (transitoire, affiné par rôle dans une migration
-- séparée : voir feuille de route "roadmap-audit2-securite-roles.md", Phase B).
--
-- Idempotente.
-- =====================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['lmb_products', 'lmb_promotions'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table % absente, ignorée.', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS "anon_read_only" ON public.%I;', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);
  END LOOP;
END $$;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--
--   -- Doit renvoyer 0 ligne pour ces deux tables :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('lmb_products', 'lmb_promotions')
--     AND policyname = 'anon_read_only';
--
--   -- Test réseau (remplacer VOTRE_PROJET et CLE_ANON) :
--   curl -s -o /dev/null -w "lmb_products (anon) -> HTTP %{http_code}\n" \
--     "https://VOTRE_PROJET.supabase.co/rest/v1/lmb_products?select=*" \
--     -H "apikey: CLE_ANON" -H "Authorization: Bearer CLE_ANON"
--   -- Attendu : 401/403 (ou 200 avec un tableau vide selon la conf PostgREST).
--
--   -- Vérifier ensuite que l'application fonctionne normalement pour un
--   -- compte connecté (caisse : recherche produit OK, code promo OK).
-- =====================================================================
