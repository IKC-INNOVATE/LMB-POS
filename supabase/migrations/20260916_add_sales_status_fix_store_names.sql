-- Migration : colonne status/voided_reason sur lmb_sales + fusion du nom de
-- boutique "LMB Boutique Abidjan (Cocody)" vers "ABIDJAN"
--
-- Additive et idempotente. Aucune suppression de ligne, aucune perte de
-- données : payment_method n'est pas modifié (il reste tel quel comme trace
-- historique), on ajoute seulement deux colonnes structurées et on corrige le
-- nom de boutique sur des lignes déjà réellement liées à Abidjan.
--
-- CONTEXTE (audit lecture seule du 29/08/2026, via l'utilisateur dans le SQL
-- Editor Supabase, cet environnement n'ayant pas d'accès réseau) :
--
--   SELECT store_name, COUNT(*) FROM lmb_sales GROUP BY store_name;
--     DAKAR                          -> 15
--     LMB Boutique Abidjan (Cocody)  ->  9   <- nom hérité, plus jamais écrit
--                                             par le code actuel (StoreCity ne
--                                             connaît que 'DAKAR' / 'ABIDJAN')
--     ABIDJAN                        ->  1
--
--   Les 9 lignes "Cocody" (toutes datées du 20/08/2026) représentent de vraies
--   ventes : 846 000 FCFA au total (dont 161 500 FCFA en espèces), plus 1
--   vente annulée à 0 FCFA. Comme normalizeStoreCode()/normalizeStore() (dans
--   lib/services/merchant-accounts.ts et lib/services/store-comparison.ts) ne
--   reconnaissent que 'DAKAR'/'ABIDJAN', ces 9 ventes étaient jusqu'ici comptées
--   à part ("hors DAKAR/ABIDJAN"), donc absentes des totaux Abidjan sur les
--   écrans Comparatif / Finances / Comptes Marchands.
--
--   Une des 9 lignes a son payment_method écrasé par un texte descriptif :
--     id c4465525-f5bc-452d-94c3-8ec2a7bea58b
--     payment_method = 'ANNULÉ / REMBOURSÉ (Par Direction Générale LMB)'
--     total_amount_xof = 0
--   -> c'est le cas visé par le constat d'audit initial : pas de colonne
--      structurée pour distinguer une vente annulée d'un mode de paiement.
--
-- ⚠️ IMPORTANT — ce que cette migration NE corrige PAS :
--   Si une clôture de caisse (lmb_registers, colonne theoretical_cash) a déjà
--   été faite pour ABIDJAN sur une période couvrant le 20/08/2026, son solde
--   théorique enregistré à l'époque ne tenait pas compte des 161 500 FCFA
--   espèces de ces ventes "Cocody" (closeRegister filtre par store_name
--   exact). Cette migration corrige les données pour les rapports FUTURS
--   (recalculés à la demande) ; elle ne recalcule pas rétroactivement une
--   clôture déjà enregistrée. À vérifier manuellement avec la Direction si
--   une telle clôture existe pour cette période.
--
-- =====================================================================

-- 1. Colonnes structurées pour le statut d'une vente (additif).
ALTER TABLE public.lmb_sales
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'COMPLETED';

ALTER TABLE public.lmb_sales
  ADD COLUMN IF NOT EXISTS voided_reason text;

-- 2. Backfill : la vente déjà annulée/remboursée récupère un vrai statut
--    structuré. payment_method n'est PAS touché (trace historique conservée).
UPDATE public.lmb_sales
SET
  status = 'CANCELLED',
  voided_reason = payment_method
WHERE
  status <> 'CANCELLED'
  AND (payment_method ILIKE '%ANNUL%' OR payment_method ILIKE '%REMBOURS%');

-- 3. Fusion du nom de boutique hérité vers la convention actuelle ('ABIDJAN'),
--    pour que ces 9 ventes réelles soient enfin comptées dans les totaux
--    Abidjan des écrans Comparatif / Finances / Comptes Marchands.
UPDATE public.lmb_sales
SET store_name = 'ABIDJAN'
WHERE store_name = 'LMB Boutique Abidjan (Cocody)';

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--
--   -- Il ne doit plus rester que DAKAR / ABIDJAN :
--   SELECT store_name, COUNT(*) FROM public.lmb_sales GROUP BY store_name;
--
--   -- La vente annulée doit porter le nouveau statut, payment_method inchangé :
--   SELECT id, status, voided_reason, payment_method, store_name
--   FROM public.lmb_sales
--   WHERE id = 'c4465525-f5bc-452d-94c3-8ec2a7bea58b';
--
--   -- Toutes les autres ventes doivent rester status = 'COMPLETED' :
--   SELECT status, COUNT(*) FROM public.lmb_sales GROUP BY status;
-- =====================================================================
