-- LV-REPORTS-CUSTOM-SCHEDULER-CANONICAL-SOR-UNMOUNTED — owner-locked §9.6 (2026-07-04):
-- "reporting.* canonical for scheduled reports (migrate reports.* rows in, archive the old)".
--
-- reporting.scheduled_reports is a fully-built, unmounted engine (routes + worker both exist in
-- apps/backend/src/scheduled-reports/ but neither was ever wired into index.ts) — this is not a
-- missing feature, it is a disconnected one. The mounted legacy engine
-- (apps/backend/src/reports/scheduled-reports.routes.ts, reports.scheduled_reports table) has 18
-- rows on prod, all identical-created_at system seed defaults (2026-05-12), NOT owner-authored
-- schedules — every one carries recipient_roles (role tags: Owner/Safety/Accountant) with an
-- EMPTY recipient_emails array, and no cron/worker currently processes reports.scheduled_reports
-- at all (verified live: apps/backend/src/jobs/scheduled-reports-emailer.ts delegates to
-- reports/scheduled/runner.service.ts, which is the wholly separate Q8 scheduled_subscriptions
-- worker — it never reads reports.scheduled_reports). These 18 rows have never actually delivered
-- an email; they are inert configuration placeholders, not working schedules this migration risks
-- breaking.
--
-- This migration:
--   §1 adds recipient_roles (additive, preserves the legacy role-tag for audit/history — the
--       canonical worker only sends to literal recipients_to emails, so a migrated row with no
--       real email on file is honestly empty, not fabricated) and void/deactivation fields to
--       reporting.scheduled_reports (append-only law: void-not-delete replaces the canonical
--       engine's hard DELETE — see the paired backend PR).
--   §2 widens created_by_user_id to nullable (TRUE SUPERSET — the legacy rows have no human
--       creator; NULL is honest, a fabricated attribution would not be) and widens the frequency
--       CHECK to accept 'quarterly' as first-class (matching next-run.ts's own frequency union,
--       updated in the paired backend PR) instead of forcing a synthetic cron string for it.
--   §3 migrates the 18 rows, preserving their original id (idempotent via ON CONFLICT DO NOTHING),
--       parsing the weekday out of cadence_detail ("Mon 8:00am" style) for weekly rows.
--
-- CREATE/ALTER-only, idempotent, no destructive change. reports.scheduled_reports is left
-- untouched (archive-only law — the table stays; only its route mounting is superseded in the
-- paired backend PR). No QBO work.

BEGIN;

-- §1 — additive columns on the canonical table.
DO $$
BEGIN
  IF to_regclass('reporting.scheduled_reports') IS NULL THEN
    RAISE NOTICE 'REPORTS-CANON: reporting.scheduled_reports absent — skip §1';
    RETURN;
  END IF;

  ALTER TABLE reporting.scheduled_reports
    ADD COLUMN IF NOT EXISTS recipient_roles text[],
    ADD COLUMN IF NOT EXISTS voided_at timestamptz,
    ADD COLUMN IF NOT EXISTS voided_by_user_id uuid,
    ADD COLUMN IF NOT EXISTS void_reason text;

  IF to_regclass('identity.users') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_reports_voided_by_user_id_fkey') THEN
    ALTER TABLE reporting.scheduled_reports
      ADD CONSTRAINT scheduled_reports_voided_by_user_id_fkey
      FOREIGN KEY (voided_by_user_id) REFERENCES identity.users(id);
  END IF;

  CREATE INDEX IF NOT EXISTS ix_scheduled_reports_active
    ON reporting.scheduled_reports (operating_company_id, status) WHERE voided_at IS NULL;
END
$$;

-- §2 — TRUE SUPERSET widenings: created_by_user_id nullable (system-seeded rows have no human
-- creator — NULL is honest, a fabricated attribution is not), frequency CHECK gains 'quarterly'.
DO $$
BEGIN
  IF to_regclass('reporting.scheduled_reports') IS NULL THEN
    RAISE NOTICE 'REPORTS-CANON: reporting.scheduled_reports absent — skip §2';
    RETURN;
  END IF;

  ALTER TABLE reporting.scheduled_reports ALTER COLUMN created_by_user_id DROP NOT NULL;

  ALTER TABLE reporting.scheduled_reports DROP CONSTRAINT IF EXISTS scheduled_reports_frequency_check;
  ALTER TABLE reporting.scheduled_reports
    ADD CONSTRAINT scheduled_reports_frequency_check
    CHECK (frequency = ANY (ARRAY['daily','weekly','monthly','quarterly','cron']));
END
$$;

-- §3 — migrate the 18 legacy default-seed rows, preserving original id (idempotent).
DO $$
BEGIN
  IF to_regclass('reporting.scheduled_reports') IS NULL OR to_regclass('reports.scheduled_reports') IS NULL THEN
    RAISE NOTICE 'REPORTS-CANON: source or target table absent — skip §3';
    RETURN;
  END IF;

  INSERT INTO reporting.scheduled_reports (
    id, operating_company_id, report_id, report_params, frequency, cron_expression,
    run_time, run_day_of_week, run_day_of_month, timezone,
    recipients_to, recipient_roles, subject_template, format, status,
    created_by_user_id, last_run_at, next_run_at, created_at, updated_at
  )
  SELECT
    r.id,
    r.operating_company_id,
    r.report_id,
    COALESCE(r.params, '{}'::jsonb),
    -- quarterly is a genuine first-class frequency (apps/backend/src/scheduled-reports/next-run.ts
    -- computeNextRunAt/computeDeliveryPeriod both handle it directly) — no synthetic cron string.
    r.cadence,
    NULL,
    COALESCE(r.send_at_local_time, '08:00:00'::time),
    CASE
      WHEN r.cadence = 'weekly' THEN
        CASE lower(left(trim(r.cadence_detail), 3))
          WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2 WHEN 'wed' THEN 3
          WHEN 'thu' THEN 4 WHEN 'fri' THEN 5 WHEN 'sat' THEN 6
          ELSE 1  -- honest fallback: legacy default seed rows are all Mon/Fri, never unparseable
        END
      ELSE NULL
    END,
    NULL,
    'America/Chicago',
    COALESCE(r.recipient_emails, ARRAY[]::text[]),
    NULLIF(r.recipient_roles, ARRAY[]::text[]),
    -- Canonical requires a NOT NULL subject line; the legacy engine never had one (no delivery
    -- worker ever read this table to send one). Deterministic from report_id — not fabricated
    -- content, an honest structural placeholder the operator can edit via the canonical UI.
    initcap(replace(r.report_id, '-', ' ')) || ' — {{date}}',
    'pdf',
    CASE WHEN r.enabled AND r.is_active THEN 'active' ELSE 'paused' END,
    NULL,
    r.last_sent_at,
    r.next_due_at,
    r.created_at,
    now()
  FROM reports.scheduled_reports r
  ON CONFLICT (id) DO NOTHING;
END
$$;

COMMIT;
