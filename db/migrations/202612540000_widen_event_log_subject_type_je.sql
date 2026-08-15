-- ACCT-F5303 / AUDIT-REPORT-JE-SUBJECT-TYPE-MISCATEGORIZED
--
-- events.event_log.valid_subject_type never included invoice/bill/journal_entry, so every JE-related
-- money event (invoice.created, bill.created, ...) emitted by accounting-spine-emit.ts fell back to the
-- generic 'task' subject_type (see the fallback comment in that file) to avoid violating this CHECK.
-- That made the audit report's "Subject" column honest (it never lied) but useless for these rows — a
-- reviewer could not tell WHICH invoice or bill an event was about, and AuditReportPage.tsx had nothing
-- to drill an EntityLink through even if it wanted to.
--
-- Purely additive: widens the CHECK allowlist only. No existing row changes value, no column added, no
-- data migrated. Idempotent (DROP CONSTRAINT IF EXISTS + re-ADD is safe to run twice — same end state).
-- events.event_log is append-only evidence (no UPDATE/DELETE grants); this migration does not touch grants.

DO $$
BEGIN
  ALTER TABLE events.event_log DROP CONSTRAINT IF EXISTS valid_subject_type;
  ALTER TABLE events.event_log ADD CONSTRAINT valid_subject_type CHECK (
    subject_type IN (
      'load', 'driver', 'unit', 'geofence', 'document', 'assignment', 'status', 'broker', 'task', 'alert',
      -- ACCT-F5303: JE-related money subjects — the actual entity an invoice/bill/JE-posting event is about.
      'invoice', 'bill', 'journal_entry'
    )
  );
END $$;
