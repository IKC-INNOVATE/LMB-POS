-- Migration : registre des prestataires (Phase D.1.5)
--
-- CONTEXTE
-- --------
-- Voir roadmap-module-paie-prestataires.md. Suivi simple, sans gestion de
-- contrat pour l'instant (décision actée : formalisation possible plus
-- tard — la table est conçue pour accueillir des champs contrat sans
-- migration cassante si besoin, via ALTER TABLE ADD COLUMN).
--
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  service_description text NULL,
  usual_amount_xof numeric NULL,
  frequency text NOT NULL DEFAULT 'PONCTUEL' CHECK (frequency IN ('MENSUEL', 'HEBDOMADAIRE', 'PONCTUEL', 'AUTRE')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lmb_service_provider_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.lmb_service_providers(id),
  amount_xof numeric NOT NULL,
  payment_date date NOT NULL DEFAULT current_date,
  note text NULL,
  created_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lmb_service_provider_payments_provider_id_idx ON public.lmb_service_provider_payments(provider_id);

ALTER TABLE public.lmb_service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmb_service_provider_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_providers_direction_only" ON public.lmb_service_providers;
CREATE POLICY "service_providers_direction_only" ON public.lmb_service_providers
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

DROP POLICY IF EXISTS "service_provider_payments_direction_only" ON public.lmb_service_provider_payments;
CREATE POLICY "service_provider_payments_direction_only" ON public.lmb_service_provider_payments
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

REVOKE ALL ON public.lmb_service_providers FROM anon;
REVOKE ALL ON public.lmb_service_provider_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lmb_service_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lmb_service_provider_payments TO authenticated;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('lmb_service_providers', 'lmb_service_provider_payments');
--   -- Attendu : une policy "*_direction_only" pour chaque table, rien d'autre.
-- =====================================================================
