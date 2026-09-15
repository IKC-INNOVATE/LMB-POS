-- Migration : création de la table `inventory_reports`
--
-- CONTEXTE
-- --------
-- Le bouton "Inventaire physique" en Caisse (components/pos/PhysicalInventoryButton.tsx)
-- et lib/services/audits.ts (submitPhysicalInventoryReport) écrivent déjà dans
-- une table `inventory_reports`, et app/admin/page.tsx (onglet "Rapports
-- d'Inventaires Physiques") la lit déjà — mais cette table n'a jamais été
-- créée en base (constat de l'audit final du 2026-09-14). Sans elle, toute
-- tentative de transmission d'inventaire échoue.
--
-- RAPPEL FONCTIONNEL (voir le commentaire au-dessus de submitPhysicalInventoryReport
-- dans lib/services/audits.ts) : ce rapport est VOLONTAIREMENT PUREMENT
-- INFORMATIF. Une caissière transmet un comptage, la Direction le consulte,
-- et corrige elle-même le stock officiel si besoin via l'outil dédié
-- (lmb_inventory_audits). Ici, on ne fait qu'enregistrer le rapport.
--
-- COLONNES : déduites exactement du payload envoyé par submitPhysicalInventoryReport
-- (cashier_name, location_country, total_expected, total_counted, net_variance,
-- status, details, created_at) et de l'interface InventoryReportItem lue par
-- app/admin/page.tsx (ajoute seulement `id`).
--
-- DROITS D'ACCÈS (RLS), par cohérence avec le reste de l'application :
--   - Écriture (transmission d'un rapport) : les 3 rôles (CAISSIER, GERANT,
--     DIRECTION), puisque c'est un caissier en Caisse qui transmet.
--   - Lecture : réservée à GERANT et DIRECTION, comme le reste des pages
--     /admin/* (CAISSIER_ALLOWED_ADMIN_PATHS est vide : un CAISSIER ne
--     charge jamais app/admin/page.tsx). Pas de colonne boutique structurée
--     ici (location_country est un libellé texte, pas un code) : pas de
--     scoping par boutique possible, comme lmb_purchase_orders/lmb_suppliers.
--   - Aucune modification ni suppression prévue dans le code actuel : pas de
--     policy UPDATE/DELETE (personne n'a de droit, même DIRECTION, pour
--     l'instant — à ajouter plus tard si un besoin de correction apparaît).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, policies DROP IF EXISTS avant
-- recréation. Peut être exécutée plusieurs fois sans risque.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.inventory_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  cashier_name     text NOT NULL,
  location_country text NOT NULL,
  total_expected   numeric NOT NULL DEFAULT 0,
  total_counted    numeric NOT NULL DEFAULT 0,
  net_variance     numeric NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'CONFORME',
  details          jsonb NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE public.inventory_reports IS
  'Rapport d''inventaire physique transmis depuis la Caisse (PhysicalInventoryButton). Purement informatif : ne modifie jamais le stock officiel. Consulté par la Direction/GERANT dans app/admin (onglet "Rapports d''Inventaires Physiques").';

ALTER TABLE public.inventory_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reports FORCE ROW LEVEL SECURITY;

-- Aucun accès pour anon (cohérent avec le reste des tables métier sensibles).
REVOKE ALL ON public.inventory_reports FROM anon;

DROP POLICY IF EXISTS "inventory_reports_insert_staff" ON public.inventory_reports;
CREATE POLICY "inventory_reports_insert_staff"
  ON public.inventory_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_staff_role() IN ('CAISSIER', 'GERANT', 'DIRECTION'));

DROP POLICY IF EXISTS "inventory_reports_select_management" ON public.inventory_reports;
CREATE POLICY "inventory_reports_select_management"
  ON public.inventory_reports
  FOR SELECT
  TO authenticated
  USING (public.current_staff_role() IN ('GERANT', 'DIRECTION'));

-- =====================================================================
-- VÉRIFICATION MANUELLE (après exécution) :
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'inventory_reports'
--   ORDER BY ordinal_position;
--
--   Puis, en conditions réelles : transmettre un inventaire physique en
--   Caisse (compte CAISSIER), et vérifier qu'il apparaît bien dans
--   app/admin (onglet "Rapports d'Inventaires Physiques", compte GERANT ou
--   DIRECTION).
-- =====================================================================
