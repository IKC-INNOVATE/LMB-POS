-- Ligne de test pour pouvoir tester "Marquer payé" (Phase 4 - Registre RH)
-- À exécuter dans Supabase SQL Editor. Peut être supprimée après le test.

insert into lmb_social_contribution_payments
  (quarter_label, period_start, period_end, amount_due_xof, due_date, status)
values
  ('T3 2026', '2026-07-01', '2026-09-30', 45000, '2026-10-15', 'DUE');
