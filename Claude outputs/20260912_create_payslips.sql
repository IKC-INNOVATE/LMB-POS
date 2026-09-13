-- Migration : table des bulletins de paie générés (Phase D.1.3)
--
-- CONTEXTE
-- --------
-- Voir roadmap-module-paie-prestataires.md. `computed_breakdown` conserve un
-- instantané complet du calcul (taux utilisés, détail des lignes) au moment
-- de la génération, pour qu'un bulletin déjà émis reste exact et cohérent
-- même si les taux de lmb_payroll_settings changent ensuite.
--
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.lmb_payroll_employees(id),
  -- Premier jour du mois concerné (ex. 2026-09-01 pour le bulletin de septembre 2026).
  period_month date NOT NULL,
  gross_salary_xof numeric NOT NULL,
  ipres_employee_xof numeric NOT NULL,
  ipres_employer_xof numeric NOT NULL,
  css_employer_xof numeric NOT NULL,
  ir_xof numeric NOT NULL,
  net_salary_xof numeric NOT NULL,
  computed_breakdown jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid NULL REFERENCES auth.users(id),
  UNIQUE (employee_id, period_month)
);

CREATE INDEX IF NOT EXISTS lmb_payslips_employee_id_idx ON public.lmb_payslips(employee_id);

ALTER TABLE public.lmb_payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payslips_direction_only" ON public.lmb_payslips;
CREATE POLICY "payslips_direction_only" ON public.lmb_payslips
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

REVOKE ALL ON public.lmb_payslips FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lmb_payslips TO authenticated;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'lmb_payslips';
--   -- Attendu : uniquement "payslips_direction_only".
-- =====================================================================
