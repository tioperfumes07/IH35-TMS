-- FINDING: ACCT-F5401 — found live 2026-08-17 during Settlements Wave D2 live-verify: clicking
-- "Mark Paid Manually" on settlement S-2026-0002 fired IMMEDIATELY on click, no confirmation step,
-- transitioning payment_state unpaid -> manual_paid (a TERMINAL state in the app's own state
-- machine — validateTransition()'s `manual_paid: []` means there is no outbound transition, by
-- design). The frontend button also silently used a stale prefilled "check" default in the
-- Payment method field rather than requiring the operator to choose one. No GL/journal entry was
-- touched (markPaidManually() only writes driver_finance.driver_settlements.payment_state/
-- payment_method/payment_bank_reference/paid_at + an audit trail) — this is a payment-status
-- correction, not a reversal of money movement.
--
-- FIX (this migration): the frontend fix adds a confirm step before firing Mark Paid Manually, and
-- adds a real "Reopen (correction)" action for Owner/Admin when payment_state = manual_paid, calling
-- a new backend correction endpoint (reopenManualPaid in settlement-payment.service.ts). That
-- correction transition is intentionally NOT modeled as a normal business transition in
-- validateTransition() (manual_paid stays terminal for the ordinary pipeline) — it is a distinct,
-- explicitly-audited correction path, gated to only fire from manual_paid, requiring a reason, and
-- writing BOTH a new settlement_payment_events row (event_type 'reopened_correction') and a CRUD
-- audit row. This preserves the original 'marked_paid_manually' event as a permanent, honest record
-- (VOID = reversal, nothing deletable) rather than erasing it.
--
-- This migration only widens the settlement_payment_events.event_type CHECK constraint (added
-- unnamed in 0088_p5_t5_settlement_payment_state.sql, Postgres auto-named it
-- settlement_payment_events_event_type_check) to allow the new 'reopened_correction' value.
-- payment_state's CHECK already includes 'unpaid' (the correction's target state) — no change
-- needed there.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT unconditionally re-applies the same
-- (now-widened) definition. Additive: no existing row rewritten, no data loss, no account/GL touched.

ALTER TABLE driver_finance.settlement_payment_events
  DROP CONSTRAINT IF EXISTS settlement_payment_events_event_type_check;

ALTER TABLE driver_finance.settlement_payment_events
  ADD CONSTRAINT settlement_payment_events_event_type_check
  CHECK (event_type IN ('queued', 'sent', 'cleared', 'bounced', 'retried', 'marked_paid_manually', 'reopened_correction'));
