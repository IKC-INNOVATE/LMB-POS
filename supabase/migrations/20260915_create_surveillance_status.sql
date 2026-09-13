-- Migration : Statut « Vidéosurveillance & Pointage caméra » — table singleton
--             éditable par la Direction, remplace l'onglet vide LIVE_CAMERAS.
-- Generated: 2026-09-15
--
-- CONTEXTE
-- --------
-- Onglet « Vidéosurveillance » du dashboard Direction : caméras déjà
-- installées en boutique (Dakar) mais non opérationnelles faute de
-- connexion internet sur place ; capacité de reconnaissance faciale /
-- contrôle d'accès des caméras non encore vérifiée avec le fournisseur.
-- Décision (validée avec l'utilisateur) : au lieu d'un écran « à venir »,
-- une page réelle affichant l'état des 2 points bloquants (internet Dakar,
-- capacité API caméra), éditable par la DIRECTION au fur et à mesure de
-- l'avancement, sans nécessiter de nouveau déploiement de code à chaque
-- mise à jour de statut.
--
-- Table singleton (une seule ligne, id fixe forcé par CHECK) : pas un
-- historique, juste l'état courant + qui/quand la dernière modification.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + INSERT ... ON CONFLICT DO
-- NOTHING pour la ligne singleton + bloc RLS rejouable.
--
-- RLS : même patron transitoire que les migrations précédentes (20260901,
-- 20260913) : anon aucun accès, authenticated accès complet (restriction
-- réelle à la DIRECTION au niveau applicatif, DIRECTION_ONLY_ADMIN_PATHS
-- dans lib/services/auth.ts).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_surveillance_status (
  id                    integer NOT NULL PRIMARY KEY DEFAULT 1,
  internet_dakar_ready  boolean NOT NULL DEFAULT false,
  internet_dakar_notes  text NULL,
  camera_api_ready      boolean NOT NULL DEFAULT false,
  camera_api_notes      text NULL,
  updated_by            text NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lmb_surveillance_status_singleton_chk CHECK (id = 1)
);

-- Ligne unique initiale (état constaté au 29/08/2026 : caméras montées mais
-- pas d'internet sur place, capacité API caméra non vérifiée).
INSERT INTO public.lmb_surveillance_status (id, internet_dakar_ready, camera_api_ready)
VALUES (1, false, false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- RLS — patron transitoire identique aux migrations précédentes.
-- ---------------------------------------------------------------------
ALTER TABLE public.lmb_surveillance_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmb_surveillance_status FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.lmb_surveillance_status FROM anon;

DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_surveillance_status;
CREATE POLICY "authenticated_all_access" ON public.lmb_surveillance_status
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--   SELECT * FROM public.lmb_surveillance_status;
--   -- doit retourner exactement 1 ligne (id = 1).
-- =====================================================================
