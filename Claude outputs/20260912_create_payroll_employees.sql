-- Migration : table des salariés en paie (Phase D.1.2)
--
-- CONTEXTE
-- --------
-- Voir roadmap-module-paie-prestataires.md. Un salarié en paie n'a pas
-- forcément de compte de connexion à l'application (staff_id nullable) : ce
-- module suit la rémunération réelle, indépendamment des rôles CAISSIER/
-- GERANT/DIRECTION gérés par lmb_staff.
--
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_payroll_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NULL REFERENCES public.lmb_staff(id),
  full_name text NOT NULL,
  contract_type text NOT NULL DEFAULT 'CDD' CHECK (contract_type IN ('CDD', 'CDI')),
  contract_start_date date NOT NULL,
  contract_end_date date NULL,
  base_salary_xof numeric NOT NULL DEFAULT 0,
  sursalaire_xof numeric NOT NULL DEFAULT 0,
  prime_transport_xof numeric NOT NULL DEFAULT 0,
  -- Primes additionnelles futures, sans migration cassante : [{ "label": "...", "amount_xof": 0 }]
  other_primes jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Nombre de parts fiscales pour le calcul IRPP (1 = célibataire sans enfant,
  -- 1.5 = marié sans enfant ou célibataire avec 1 enfant, etc.)
  family_parts numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lmb_payroll_employees_staff_id_idx ON public.lmb_payroll_employees(staff_id);

ALTER TABLE public.lmb_payroll_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_employees_direction_only" ON public.lmb_payroll_employees;
CREATE POLICY "payroll_employees_direction_only" ON public.lmb_payroll_employees
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

REVOKE ALL ON public.lmb_payroll_employees FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lmb_payroll_employees TO authenticated;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'lmb_payroll_employees';
--   -- Attendu : uniquement "payroll_employees_direction_only".
-- =====================================================================
