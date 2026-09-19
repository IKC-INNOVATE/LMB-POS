-- =====================================================================
-- Phase 5 du chantier Charges d'exploitation (voir
-- claude/roadmap-module-charges-exploitation-2026-09-19.md) :
-- ajout d'un champ "Boutique" directement sur la fiche de chaque salarié
-- du Registre RH (lmb_payroll_employees).
--
-- Pourquoi : aujourd'hui, la seule boutique connue pour un salarié est
-- celle de son compte de connexion (lmb_staff.store_code) - or tous les
-- salariés n'ont pas de compte de connexion (ex. agent d'entretien ou de
-- sécurité). Ce nouveau champ est indépendant du compte de connexion et
-- permet de rattacher n'importe quel salarié à sa boutique.
--
-- NULL = "Direction / aucune boutique précise" (ex. Ibrahim lui-même, ou
-- un poste réseau) - même logique que lmb_staff.store_code pour un rôle
-- DIRECTION.
--
-- Rien n'est cassé : colonne nullable, aucune valeur par défaut imposée,
-- tous les salariés existants restent NULL tant qu'on ne les modifie pas
-- un par un depuis l'écran Registre RH.
-- Décisions validées par Ibrahim (19/09, voir le doc cité plus haut).
-- =====================================================================

ALTER TABLE public.lmb_payroll_employees
  ADD COLUMN IF NOT EXISTS store_code text;

ALTER TABLE public.lmb_payroll_employees
  DROP CONSTRAINT IF EXISTS lmb_payroll_employees_store_code_check;

ALTER TABLE public.lmb_payroll_employees
  ADD CONSTRAINT lmb_payroll_employees_store_code_check
  CHECK (store_code IS NULL OR store_code IN ('DAKAR', 'ABIDJAN'));

-- Vérification (à exécuter après le ALTER TABLE pour confirmer) :
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'lmb_payroll_employees' AND column_name = 'store_code';
