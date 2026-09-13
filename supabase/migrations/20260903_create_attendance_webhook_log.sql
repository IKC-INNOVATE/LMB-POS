-- Migration: Journal des tentatives refusées sur le webhook de pointage
-- Generated: 2026-09-03
--
-- CONTEXTE
-- --------
-- app/api/attendance/webhook/route.ts exige désormais un header
--   Authorization: Bearer <ATTENDANCE_WEBHOOK_SECRET>
-- Chaque appel SANS ce secret (ou avec un mauvais secret) est refusé (401) et
-- consigné ici pour pouvoir détecter une tentative d'intrusion a posteriori.
--
-- L'application se connecte avec la clé "anon". Cette table est donc un
-- réceptacle en ÉCRITURE SEULE pour anon : INSERT autorisé, SELECT interdit.
-- Seule la DIRECTION peut relire le journal.
--
-- Idempotente : peut être rejouée sans erreur.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lmb_attendance_webhook_log (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempted_at            timestamptz NOT NULL DEFAULT now(),
  ip_address              text,
  attempted_employee_name text,
  reason                  text NOT NULL DEFAULT 'UNAUTHORIZED'
);

COMMENT ON TABLE public.lmb_attendance_webhook_log IS
  'Tentatives refusées sur le webhook de pointage (auth manquante/invalide). Écriture seule pour anon, lecture DIRECTION.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.lmb_attendance_webhook_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmb_attendance_webhook_log FORCE ROW LEVEL SECURITY;

-- anon : INSERT uniquement (aucun SELECT / UPDATE / DELETE).
REVOKE ALL ON public.lmb_attendance_webhook_log FROM anon;
GRANT INSERT ON public.lmb_attendance_webhook_log TO anon;

-- authenticated : INSERT également (au cas où le webhook tournerait sous une session).
GRANT INSERT, SELECT ON public.lmb_attendance_webhook_log TO authenticated;

DROP POLICY IF EXISTS "webhook_log_anon_insert" ON public.lmb_attendance_webhook_log;
CREATE POLICY "webhook_log_anon_insert" ON public.lmb_attendance_webhook_log
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "webhook_log_authenticated_insert" ON public.lmb_attendance_webhook_log;
CREATE POLICY "webhook_log_authenticated_insert" ON public.lmb_attendance_webhook_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Lecture réservée à la DIRECTION (fonction créée dans 20260902_create_staff_table.sql).
DROP POLICY IF EXISTS "webhook_log_direction_read" ON public.lmb_attendance_webhook_log;
CREATE POLICY "webhook_log_direction_read" ON public.lmb_attendance_webhook_log
  FOR SELECT
  TO authenticated
  USING (public.current_staff_is_direction());
