-- Migration : création de la table `lmb_charge_templates` (Phase 3 — module
-- Charges d'exploitation, charges récurrentes)
--
-- CONTEXTE
-- --------
-- Suite de la Phase 1 (table `lmb_charges`, migration 20260923). Décision
-- validée par Ibrahim (voir claude/roadmap-module-charges-exploitation-2026-09-19.md) :
-- une charge récurrente (ex. « Loyer boutique Dakar, 150 000 FCFA, le 5 de
-- chaque mois ») est définie UNE SEULE FOIS comme « modèle », puis une vraie
-- ligne dans `lmb_charges` est générée chaque mois à partir de ce modèle —
-- automatiquement, mais pas par une tâche indépendante qui tournerait seule
-- en arrière-plan (ce projet n'a pas cette infrastructure). À la place :
-- génération "paresseuse", dès que quelqu'un ouvre l'écran Charges pour un
-- mois où l'instance de ce modèle n'existe pas encore (voir
-- lib/services/charges.ts, ensureRecurringChargesGeneratedForMonth).
--
-- COLONNES
-- --------
--   store_code / category / amount_xof / payment_method / note : mêmes
--   définitions et mêmes valeurs autorisées que `lmb_charges` (Phase 1).
--   day_of_month : jour du mois où la charge doit être générée, borné à
--     1–28 (et non 1–31) pour rester valide sur TOUS les mois sans logique
--     de repli complexe (pas de "31 février") — un loyer "le 28" au lieu du
--     "30" n'a aucune conséquence pratique pour ce cas d'usage.
--   is_active : permet de mettre un modèle "en pause" sans le supprimer —
--     l'historique des charges déjà générées à partir de lui reste intact
--     (voir template_id ci-dessous), seule la génération future s'arrête.
--   created_by_name / created_by_role : qui a créé ce modèle, même
--     convention que `lmb_charges.recorded_by_name/role`.
--
-- LIEN AVEC `lmb_charges`
-- ------------------------
-- Ajout d'une colonne `template_id` sur `lmb_charges`, nullable : NULL pour
-- une charge ponctuelle (Phase 2, comportement inchangé), renseignée pour
-- une charge générée automatiquement à partir d'un modèle (traçabilité —
-- Ibrahim doit pouvoir voir qu'une ligne vient d'un modèle récurrent).
-- ON DELETE SET NULL : supprimer un modèle ne supprime jamais l'historique
-- des charges déjà générées, il les détache simplement du modèle disparu.
--
-- DROITS D'ACCÈS (RLS)
-- ---------------------
-- Exactement la même règle que `lmb_charges` (Phase 1, mêmes personnes
-- doivent pouvoir créer/gérer les modèles récurrents que les charges
-- ponctuelles) : DIRECTION accès complet, GERANT limité à sa boutique
-- (store_code = current_staff_store()), CAISSIER aucun accès.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- policies DROP IF EXISTS avant recréation.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_charge_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  store_code        text NOT NULL,
  category          text NOT NULL,
  amount_xof        numeric NOT NULL,
  day_of_month      integer NOT NULL,
  payment_method    text,
  note              text,
  is_active         boolean NOT NULL DEFAULT true,
  created_by_name   text NOT NULL,
  created_by_role   text,
  CONSTRAINT lmb_charge_templates_store_code_check
    CHECK (store_code IN ('DAKAR', 'ABIDJAN')),
  CONSTRAINT lmb_charge_templates_category_check
    CHECK (category IN ('LOYER', 'ELECTRICITE', 'EAU', 'INTERNET_TELEPHONE', 'ASSURANCE', 'AUTRE')),
  CONSTRAINT lmb_charge_templates_amount_positive_check
    CHECK (amount_xof > 0),
  CONSTRAINT lmb_charge_templates_day_of_month_check
    CHECK (day_of_month BETWEEN 1 AND 28),
  CONSTRAINT lmb_charge_templates_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('ESPECES', 'VIREMENT', 'MOBILE_MONEY', 'CHEQUE', 'AUTRE'))
);

COMMENT ON TABLE public.lmb_charge_templates IS
  'Modèles de charges récurrentes (ex. loyer mensuel) : définis une fois, une vraie ligne lmb_charges est générée chaque mois à partir du modèle (génération paresseuse à l''ouverture de l''écran Charges, voir ensureRecurringChargesGeneratedForMonth). is_active=false = modèle en pause, ne génère plus rien, historique conservé.';

ALTER TABLE public.lmb_charge_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmb_charge_templates FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.lmb_charge_templates FROM anon;

DROP POLICY IF EXISTS "charge_templates_access" ON public.lmb_charge_templates;
CREATE POLICY "charge_templates_access"
  ON public.lmb_charge_templates
  FOR ALL
  TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() = 'GERANT' AND store_code = public.current_staff_store())
  )
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() = 'GERANT' AND store_code = public.current_staff_store())
  );

-- Lien de traçabilité : une charge générée automatiquement pointe vers son modèle.
ALTER TABLE public.lmb_charges
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.lmb_charge_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lmb_charges.template_id IS
  'NULL pour une charge ponctuelle (saisie manuelle). Renseigné quand la charge a été générée automatiquement à partir d''un modèle récurrent (lmb_charge_templates).';

-- =====================================================================
-- VÉRIFICATION MANUELLE (après exécution) :
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'lmb_charge_templates'
--   ORDER BY ordinal_position;
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'lmb_charges' AND column_name = 'template_id';
--
--   Puis, en conditions réelles (une fois l'écran mis à jour en Phase 3) :
--   créer un modèle récurrent, ouvrir l'écran pour le mois en cours et
--   vérifier qu'une charge est générée automatiquement une seule fois (pas
--   de doublon en rechargeant la page plusieurs fois).
-- =====================================================================
