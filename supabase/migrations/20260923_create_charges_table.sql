-- Migration : création de la table `lmb_charges` (Phase 1 — module Charges d'exploitation)
--
-- CONTEXTE
-- --------
-- Demande du 19/09 : « Je souhaite avoir cette fonctionnalité qui gère les
-- charges et qui est déductible lors du rapport financier. » Analyse préalable
-- (sans modification) : aujourd'hui, seul le bouton « Sortie de caisse »
-- (lmb_register_expenses, voir lib/services/register.ts) permet de sortir de
-- l'argent de la caisse — pas d'historique consultable par catégorie, pas de
-- lien organisé avec le rapport financier. `lmb_expenses` existe déjà mais ne
-- sert aujourd'hui qu'aux frais de transport/douane générés automatiquement
-- lors d'un transfert inter-boutiques (app/admin/page.tsx, ~ligne 624) — pas
-- vocation à recevoir des charges comme le loyer ou l'électricité.
--
-- Cette migration crée une table dédiée, sans toucher à l'existant :
--   - distincte de `lmb_expenses` (frais de transfert automatiques)
--   - distincte de `lmb_register_expenses` (sorties de caisse en espèces)
-- Rien n'est cassé, rien n'est renommé.
--
-- Décisions validées par Ibrahim (19/09, voir le document de feuille de
-- route claude/roadmap-module-charges-exploitation-2026-09-19.md) :
--   1. Chaque charge est toujours rattachée à UNE SEULE boutique (Dakar ou
--      Abidjan) — pas de charge « réseau » partagée entre les deux.
--   2. Direction ET Gérants peuvent enregistrer une charge (un Gérant ne
--      voit/saisit que celles de sa boutique, comme pour la caisse et le
--      Registre RH aujourd'hui) — un Caissier n'y a jamais accès.
--   3. Charges ponctuelles ET récurrentes (ex. loyer mensuel) — la partie
--      récurrente (modèles + génération automatique) est prévue en Phase 3
--      d'une migration séparée ; cette Phase 1 ne pose que la fondation
--      (charges ponctuelles / déjà générées), sans encore de notion de modèle.
--
-- COLONNES
-- --------
--   store_code       : boutique rattachée, obligatoire ('DAKAR' | 'ABIDJAN').
--   category          : nature de la charge (Loyer, Électricité, Eau,
--                        Internet/Téléphone, Assurance, Autre).
--   amount_xof        : montant en francs CFA, obligatoire, strictement positif.
--   charge_date       : date à laquelle la charge s'applique (peut différer de
--                        la date de saisie) — c'est cette date qui sert au
--                        filtrage par période dans le rapport financier.
--   payment_method    : mode de règlement, informatif, optionnel.
--   note               : texte libre optionnel (ex. numéro de facture).
--   recorded_by_name   : nom de la personne qui a enregistré la charge (même
--                         convention que `cashier_name` sur inventory_reports :
--                         un texte figé au moment de la saisie, pas une clé
--                         étrangère, pour rester lisible même si le compte est
--                         désactivé plus tard).
--   recorded_by_role   : rôle de cette personne au moment de la saisie,
--                         informatif (traçabilité).
--
-- DROITS D'ACCÈS (RLS)
-- ---------------------
-- Exactement le même principe que `lmb_expenses` (voir
-- 20260920_rls_policies_by_role.sql, section 5) : DIRECTION a accès complet à
-- toutes les boutiques ; GERANT est limité aux lignes de sa propre boutique
-- (store_code = public.current_staff_store()) ; CAISSIER n'a AUCUN accès (pas
-- de policy pour ce rôle, comme demandé par Ibrahim).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, policies DROP IF EXISTS avant
-- recréation. Peut être exécutée plusieurs fois sans risque.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_charges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  store_code        text NOT NULL,
  category          text NOT NULL,
  amount_xof        numeric NOT NULL,
  charge_date       date NOT NULL DEFAULT current_date,
  payment_method    text,
  note              text,
  recorded_by_name  text NOT NULL,
  recorded_by_role  text,
  CONSTRAINT lmb_charges_store_code_check
    CHECK (store_code IN ('DAKAR', 'ABIDJAN')),
  CONSTRAINT lmb_charges_category_check
    CHECK (category IN ('LOYER', 'ELECTRICITE', 'EAU', 'INTERNET_TELEPHONE', 'ASSURANCE', 'AUTRE')),
  CONSTRAINT lmb_charges_amount_positive_check
    CHECK (amount_xof > 0),
  CONSTRAINT lmb_charges_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('ESPECES', 'VIREMENT', 'MOBILE_MONEY', 'CHEQUE', 'AUTRE'))
);

CREATE INDEX IF NOT EXISTS lmb_charges_store_date_idx
  ON public.lmb_charges (store_code, charge_date);

COMMENT ON TABLE public.lmb_charges IS
  'Charges d''exploitation hors salaires (loyer, électricité, eau, internet/téléphone, assurance, autre), rattachées chacune à une seule boutique. Distincte de lmb_expenses (frais de transfert automatiques) et de lmb_register_expenses (sorties de caisse en espèces). Déduite du bénéfice dans Finance & Reporting (Phase 4 du chantier Charges, à venir).';

ALTER TABLE public.lmb_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmb_charges FORCE ROW LEVEL SECURITY;

-- Aucun accès pour anon (cohérent avec le reste des tables financières sensibles).
REVOKE ALL ON public.lmb_charges FROM anon;

DROP POLICY IF EXISTS "charges_access" ON public.lmb_charges;
CREATE POLICY "charges_access"
  ON public.lmb_charges
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

-- =====================================================================
-- VÉRIFICATION MANUELLE (après exécution) :
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'lmb_charges'
--   ORDER BY ordinal_position;
--
--   Puis, en conditions réelles (une fois l'écran « Charges » livré en
--   Phase 2) : enregistrer une charge avec un compte GERANT rattaché à
--   Dakar, vérifier qu'elle apparaît pour ce compte et pour un compte
--   DIRECTION, mais PAS pour un compte GERANT rattaché à Abidjan ni pour un
--   compte CAISSIER (qui ne doit même pas pouvoir lire la table).
-- =====================================================================
