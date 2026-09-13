-- Migration : suivi des versements trimestriels de cotisations sociales (Phase D.1.4)
--
-- CONTEXTE
-- --------
-- Voir roadmap-module-paie-prestataires.md. Une ligne par trimestre de
-- déclaration (ex. "2026-Q3"), remplie manuellement au départ (montant dû
-- calculé à partir des bulletins du trimestre, montant payé et date saisis
-- une fois le versement effectué auprès de la CSS/IPRES).
--
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_social_contribution_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_label text NOT NULL UNIQUE, -- ex. "2026-Q3"
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_due_xof numeric NOT NULL DEFAULT 0,
  amount_paid_xof numeric NULL,
  due_date date NOT NULL,
  paid_date date NULL,
  status text NOT NULL DEFAULT 'DUE' CHECK (status IN ('DUE', 'PAID', 'LATE')),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lmb_social_contribution_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_contributions_direction_only" ON public.lmb_social_contribution_payments;
CREATE POLICY "social_contributions_direction_only" ON public.lmb_social_contribution_payments
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

REVOKE ALL ON public.lmb_social_contribution_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lmb_social_contribution_payments TO authenticated;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'lmb_social_contribution_payments';
--   -- Attendu : uniquement "social_contributions_direction_only".
-- =====================================================================
