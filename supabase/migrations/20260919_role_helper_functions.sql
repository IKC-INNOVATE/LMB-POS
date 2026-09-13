-- Migration : fonctions utilitaires de rôle pour les policies RLS
--
-- CONTEXTE
-- --------
-- Deuxième audit (29/08/2026), constat critique #1 : depuis la Tâche 0.1, les
-- tables sensibles ont une policy "authenticated_all_access" (accès complet
-- pour tout compte connecté, quel que soit son rôle) — posée comme transitoire
-- en attendant "d'affiner par rôle plus tard". Cette migration prépare cet
-- affinement : deux fonctions que les policies (migration suivante) utilisent
-- pour savoir qui interroge la base.
--
-- Idempotente (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM public.lmb_staff
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_staff_store()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT store_code
  FROM public.lmb_staff
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- Exécutable par tout le monde (anon inclus) : pour un jeton anon ou invalide,
-- auth.uid() est NULL et les deux fonctions renvoient NULL sans erreur — une
-- policy qui les utilise refuse alors l'accès par défaut (comparaison à NULL).
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_store() TO anon, authenticated;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration, dans le SQL Editor tout en restant
-- connecté avec votre propre compte Direction — le SQL Editor Supabase
-- s'exécute avec des droits élevés, donc auth.uid() y est NULL ; ce test
-- confirme seulement que les fonctions existent et ne plantent pas) :
--
--   SELECT public.current_staff_role(), public.current_staff_store();
--   -- Attendu ici : NULL, NULL (normal, le SQL Editor n'est pas une session
--   -- utilisateur). Le vrai test se fait depuis l'application elle-même en
--   -- Tâche B.3 (connecté avec un compte CAISSIER/GERANT/DIRECTION réel).
-- =====================================================================
