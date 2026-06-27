-- Capture prod-only COLUMN drift so a clean migration build == prod.
--
-- DISPATCH-2 / TASK B. The definitive fresh-DB audit (2026-06-27: migrate an empty DB from 0001, then diff
-- its information_schema against live prod) found 21 columns that exist on the production database but are NOT
-- produced by the clean migration set — i.e. the migrations create OUTDATED shapes for these tables (notably
-- qbo.sync_alerts / sms.queue / whatsapp.queue, whose prod versions have columns the clean build lacks). On a
-- fresh deploy these columns are absent → any code path touching them 42703s. This blocks AF-1's gate that
-- "the migration set can rebuild prod."
--
-- Each column matched to its EXACT prod type / nullability / default (read live, not guessed). Idempotent:
-- ADD COLUMN IF NOT EXISTS is a no-op on prod (column already present) and adds it on a fresh build. Each
-- table guarded by existence so the migration is safe on partial DBs.
--
-- EXCLUDED (different handling, documented in the drift ledger):
--   * maintenance.v_arriving_soon.final_destination_location_id — a VIEW column (view-definition drift).
--   * ih35_migrations.applied_migrations.applied_by — the migrate runner's internal mirror ledger.

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL THEN
    ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS trailer_type text;
  END IF;

  IF to_regclass('accounting.journal_entries') IS NOT NULL THEN
    ALTER TABLE accounting.journal_entries ADD COLUMN IF NOT EXISTS idempotency_key text;
  END IF;

  IF to_regclass('compliance.drug_alcohol_test_results') IS NOT NULL THEN
    ALTER TABLE compliance.drug_alcohol_test_results ADD COLUMN IF NOT EXISTS clearinghouse_reference text;
    ALTER TABLE compliance.drug_alcohol_test_results ADD COLUMN IF NOT EXISTS created_by uuid;
    ALTER TABLE compliance.drug_alcohol_test_results ADD COLUMN IF NOT EXISTS selection_id uuid;
  END IF;

  -- NOTE: 4 columns are NOT NULL (no default) on prod — qbo.sync_alerts.kind/message,
  -- sms.queue.to_number, whatsapp.queue.body — but the app's Block-H notification dispatch code INSERTs into
  -- these queues WITHOUT supplying them. Prod's NOT NULL is therefore inconsistent with the code (it would
  -- fail on prod too if exercised; those tables are empty on prod). Capturing them NOT NULL breaks a fresh
  -- build (notification-e2e + driver-settlement-pdf-e2e). We capture the COLUMN + TYPE but leave them
  -- NULLABLE so the app works on a fresh build; this is a NO-OP on prod (columns already exist, IF NOT EXISTS
  -- skips → prod keeps its NOT NULL). The prod-vs-code NOT NULL inconsistency is flagged in the drift ledger
  -- for owner/GUARD to reconcile (fix the insert path first, then tighten the constraint).
  IF to_regclass('qbo.sync_alerts') IS NOT NULL THEN
    ALTER TABLE qbo.sync_alerts ADD COLUMN IF NOT EXISTS kind text;
    ALTER TABLE qbo.sync_alerts ADD COLUMN IF NOT EXISTS message text;
    ALTER TABLE qbo.sync_alerts ADD COLUMN IF NOT EXISTS payload jsonb;
    ALTER TABLE qbo.sync_alerts ADD COLUMN IF NOT EXISTS sync_run_id uuid;
  END IF;

  IF to_regclass('sms.queue') IS NOT NULL THEN
    ALTER TABLE sms.queue ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
    ALTER TABLE sms.queue ADD COLUMN IF NOT EXISTS error text;
    ALTER TABLE sms.queue ADD COLUMN IF NOT EXISTS provider_message_id text;
    ALTER TABLE sms.queue ADD COLUMN IF NOT EXISTS sent_at timestamptz;
    ALTER TABLE sms.queue ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
    ALTER TABLE sms.queue ADD COLUMN IF NOT EXISTS to_number text;
  END IF;

  IF to_regclass('whatsapp.queue') IS NOT NULL THEN
    ALTER TABLE whatsapp.queue ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
    ALTER TABLE whatsapp.queue ADD COLUMN IF NOT EXISTS body text;
    ALTER TABLE whatsapp.queue ADD COLUMN IF NOT EXISTS error text;
    ALTER TABLE whatsapp.queue ADD COLUMN IF NOT EXISTS provider_message_id text;
    ALTER TABLE whatsapp.queue ADD COLUMN IF NOT EXISTS sent_at timestamptz;
    ALTER TABLE whatsapp.queue ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;
