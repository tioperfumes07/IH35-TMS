-- LV-010 — an email that only reached the console must not read as DELIVERED.
--
-- ROOT CAUSE (verified on prod 2026-08-04, RLS-bypassed count)
-- email.email_queue holds 232 rows and ALL 232 are status='sent'. Every one of them carries a
-- provider_message_id beginning 'console-email-' — the exact literal produced by
-- apps/backend/src/email/providers/console.ts (`const messageId = `console-email-${Date.now()}``).
-- EMAIL_PROVIDER defaults to "console" (email/factory.ts), so on prod nothing has ever been handed to
-- a real ESP: 232 console writes, 0 real provider deliveries, every one recorded as 'sent' since
-- 2026-05-19.
--
-- Why this matters beyond tidiness: 'sent' is the word an operator, a customer-dispute, a collections
-- workflow and an auditor all read as "we delivered this." Invoices and settlement notices whose only
-- destination was stdout are indistinguishable from delivered mail. That is a false green on a
-- customer-facing money path.
--
-- FIX
--  1. A distinct terminal status 'logged_only' — the honest name for "the pipeline ran, the message
--     was rendered, nothing left the building."
--  2. A `provider` column so the record says WHICH transport handled it, instead of forcing everyone
--     to infer it from the shape of a message id.
--  3. Backfill the 232 console rows to logged_only/console. This CORRECTS a false record; it does not
--     invent one — the console origin is proven by provider_message_id on every affected row, and the
--     predicate below touches only rows carrying that literal.
--
-- 'sent' is deliberately KEPT in the CHECK: it is the correct status the moment a real ESP is wired.
-- Wiring SES/Postmark needs owner credentials and is NOT part of this migration.
--
-- Additive and idempotent. No GL, no posting, no financial table touched.

DO $$
BEGIN
  IF to_regclass('email.email_queue') IS NULL THEN
    RAISE NOTICE 'email.email_queue absent — skipping LV-010';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='email' AND table_name='email_queue' AND column_name='provider'
  ) THEN
    ALTER TABLE email.email_queue ADD COLUMN provider text NULL;
  END IF;

  -- Widen the terminal-status vocabulary to include the honest one.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='email.email_queue'::regclass AND conname='email_queue_status_check'
  ) THEN
    ALTER TABLE email.email_queue DROP CONSTRAINT email_queue_status_check;
  END IF;
  ALTER TABLE email.email_queue ADD CONSTRAINT email_queue_status_check
    CHECK (status = ANY (ARRAY['queued','sending','sent','logged_only','failed','cancelled']));
END $$;

-- Backfill ONLY rows proven console-origin by their own message id. Idempotent: re-running matches
-- nothing once status has moved off 'sent'.
UPDATE email.email_queue
   SET status = 'logged_only',
       provider = 'console',
       updated_at = now()
 WHERE status = 'sent'
   AND provider_message_id LIKE 'console-email-%';

-- Anything already delivered by a real ESP keeps status='sent' and gets its transport labelled.
UPDATE email.email_queue
   SET provider = 'unknown-legacy'
 WHERE provider IS NULL
   AND status = 'sent';

COMMENT ON COLUMN email.email_queue.provider IS
  'Transport that handled this message: console | ses | postmark | unknown-legacy. status=logged_only '
  'means the message was rendered and logged but NEVER handed to a real provider — it is not delivered '
  'mail and must never be reported as sent.';
