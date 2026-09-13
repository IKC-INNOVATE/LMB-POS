-- Migration : Comptes Marchands (Wave / Orange Money) — soldes & retraits saisis
--             manuellement par la Direction (aucune API disponible).
-- Generated: 2026-09-13
--
-- CONTEXTE
-- --------
-- Nouvel onglet « Comptes Marchands » (page dédiée /admin/merchant-accounts,
-- réservée à la DIRECTION). Trois volets :
--   1. Solde actuel par boutique et par plateforme (Wave / OM), saisi à la main.
--   2. Historique des transferts « compte marchand -> compte bancaire ».
--   3. Réconciliation : total des ventes WAVE / OM (lmb_sales.payment_method)
--      d'une période comparé aux montants saisis. AUCUNE table pour ce volet :
--      calcul en lecture seule côté service.
--
-- Deux tables créées ici :
--   - lmb_merchant_balance_snapshots : historique de relevés de solde
--     (append-only ; le « solde actuel » = dernier relevé par boutique+plateforme).
--   - lmb_merchant_withdrawals : historique des retraits vers la banque.
--
-- store_code : TEXTE LIBRE normalisé côté application (upper/trim -> DAKAR /
-- ABIDJAN), cohérent avec lmb_expenses.store_city et lmb_sales.store_name.
-- Pas de CHECK strict sur la boutique. CHECK strict uniquement sur `platform`.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + bloc
-- RLS rejouable (DROP POLICY IF EXISTS avant CREATE).
--
-- RLS : activée ici, sur le MÊME patron transitoire que 20260901_enable_rls.sql
--       (anon : aucun accès ; authenticated : accès complet, à affiner par rôle
--       plus tard). L'accès réel est déjà restreint à la DIRECTION au niveau
--       applicatif (DIRECTION_ONLY_ADMIN_PATHS dans lib/services/auth.ts).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. lmb_merchant_balance_snapshots — relevés de solde (append-only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lmb_merchant_balance_snapshots (
  id          uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code  text NOT NULL,
  platform    text NOT NULL,
  balance_xof numeric NOT NULL,
  observed_at date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by text NOT NULL,
  note        text NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lmb_merchant_balance_snapshots_platform_chk
    CHECK (platform IN ('WAVE', 'OM')),
  CONSTRAINT lmb_merchant_balance_snapshots_balance_chk
    CHECK (balance_xof >= 0)
);

CREATE INDEX IF NOT EXISTS idx_lmb_merchant_balance_snapshots_lookup
  ON public.lmb_merchant_balance_snapshots (store_code, platform, observed_at DESC, created_at DESC);


-- ---------------------------------------------------------------------
-- 2. lmb_merchant_withdrawals — retraits compte marchand -> banque
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lmb_merchant_withdrawals (
  id             uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code     text NOT NULL,
  platform       text NOT NULL,
  amount_xof     numeric NOT NULL,
  transfer_date  date NOT NULL,
  bank_reference text NULL,
  recorded_by    text NOT NULL,
  note           text NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  metadata       jsonb NULL DEFAULT '{}'::jsonb,
  CONSTRAINT lmb_merchant_withdrawals_platform_chk
    CHECK (platform IN ('WAVE', 'OM')),
  CONSTRAINT lmb_merchant_withdrawals_amount_chk
    CHECK (amount_xof > 0)
);

CREATE INDEX IF NOT EXISTS idx_lmb_merchant_withdrawals_lookup
  ON public.lmb_merchant_withdrawals (store_code, platform, transfer_date DESC);


-- ---------------------------------------------------------------------
-- 3. RLS — patron transitoire identique à 20260901_enable_rls.sql
--    anon : aucun accès. authenticated : accès complet (à affiner par rôle).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  merchant_tables text[] := ARRAY[
    'lmb_merchant_balance_snapshots',
    'lmb_merchant_withdrawals'
  ];
BEGIN
  FOREACH t IN ARRAY merchant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);

    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all_access" ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY "authenticated_all_access" ON public.%I
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    $f$, t);
  END LOOP;
END $$;


-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN
--     ('lmb_merchant_balance_snapshots', 'lmb_merchant_withdrawals');
--
--   SELECT polname, polcmd, polroles::regrole[] FROM pg_policy
--   WHERE polrelid = 'public.lmb_merchant_withdrawals'::regclass;
-- =====================================================================
