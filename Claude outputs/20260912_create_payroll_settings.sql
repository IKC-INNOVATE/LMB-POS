-- Migration : table de configuration des taux de paie (Phase D.1.1)
--
-- CONTEXTE
-- --------
-- Voir roadmap-module-paie-prestataires.md. Cette table centralise les taux
-- de cotisation utilisés par le calcul des bulletins de paie, pour qu'ils
-- soient modifiables depuis l'interface (DIRECTION uniquement) sans jamais
-- toucher au code.
--
-- ⚠️ Les valeurs par défaut ci-dessous viennent de recherches web recoupées
-- (sunupayrh.com, afrotools.com, africarrieres.com), PAS d'une source
-- officielle unique. À confirmer auprès d'un comptable ou du portail NDAMLI
-- (online.secusociale.sn) avant tout usage officiel (déclaration réelle).
-- Le plafond IPRES (ipres_ceiling_xof) est volontairement laissé NULL
-- (= aucun plafonnement appliqué) tant qu'il n'est pas confirmé : pour le
-- salaire actuellement suivi (200 000 FCFA), ça ne change rien au résultat,
-- mais il faudra le renseigner avant d'utiliser l'outil pour un salarié
-- mieux rémunéré.
--
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ipres_employee_rate numeric NOT NULL DEFAULT 0.056,
  ipres_employer_rate numeric NOT NULL DEFAULT 0.084,
  ipres_ceiling_xof numeric NULL,
  css_employer_rate numeric NOT NULL DEFAULT 0.08,
  ir_bareme jsonb NOT NULL DEFAULT '[
    {"from": 0,        "to": 630000,    "rate": 0.00},
    {"from": 630001,   "to": 1500000,   "rate": 0.20},
    {"from": 1500001,  "to": 4000000,   "rate": 0.30},
    {"from": 4000001,  "to": 8000000,   "rate": 0.35},
    {"from": 8000001,  "to": 13500000,  "rate": 0.37},
    {"from": 13500001, "to": 25000000,  "rate": 0.40},
    {"from": 25000001, "to": null,      "rate": 0.43}
  ]'::jsonb,
  effective_from date NOT NULL DEFAULT current_date,
  updated_by uuid NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Une seule ligne de configuration active pour l'instant (le plus simple
-- vu le contexte). Insérée seulement si la table est vide.
INSERT INTO public.lmb_payroll_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.lmb_payroll_settings);

ALTER TABLE public.lmb_payroll_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_settings_direction_only" ON public.lmb_payroll_settings;
CREATE POLICY "payroll_settings_direction_only" ON public.lmb_payroll_settings
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

-- Pas d'accès anon. Accès explicite pour authenticated (RLS filtre ensuite
-- par rôle réel via la policy ci-dessus).
REVOKE ALL ON public.lmb_payroll_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lmb_payroll_settings TO authenticated;

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--
--   SELECT * FROM public.lmb_payroll_settings;
--   -- Attendu : exactement 1 ligne, avec les taux par défaut ci-dessus.
--
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'lmb_payroll_settings';
--   -- Attendu : uniquement "payroll_settings_direction_only".
-- =====================================================================
