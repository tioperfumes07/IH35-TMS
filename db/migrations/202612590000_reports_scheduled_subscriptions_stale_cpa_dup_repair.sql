-- LV-REPORTS-SCHEDULED-SUBSCRIPTIONS-STALE-CPA-AND-DUPLICATE-RECIPIENTS
--
-- The all-company seed in 202606080206_scheduled_report_subscriptions.sql persisted two defects that
-- are still live today on every company row it seeded:
--   1. monthly-pnl's recipient array carries cpa@ih35dispatch.com — the owner-locked accounting law is
--      there is NO CPA; the owner is the sole financial-decision authority
--      (docs/lockdown/00_LOCKED_DECISIONS.md). No subscription may ever address that mailbox.
--   2. weekly-driver-settlement-preview and daily-safety-alerts-digest each carry the owner's own
--      address TWICE (a copy-paste seed defect, not an intentional double-send).
--
-- This is persisted source-data drift, not a display bug — SubscriptionManager.tsx renders exactly what
-- is stored. The companion write-boundary fix (normalizeRecipientEmails in subscription.service.ts,
-- same PR) prevents either defect from being reintroduced via create/update; this migration is the
-- one-time forward repair for rows that already exist.
--
-- Scope: strips the forbidden CPA address and collapses case/whitespace-insensitive duplicate
-- recipients on EVERY existing reports.scheduled_subscriptions row (not just the three known-bad
-- slugs) — the same normalization the write boundary now enforces going forward, so a row a company
-- owner already hand-edited to the same bad shape is corrected too, and no row can pass this migration
-- and still violate the invariant. Preserves the first occurrence's original casing and relative order.
-- No DELETE — this only rewrites recipient_emails; subscription and delivery-log history are untouched.
--
-- Idempotent: the second run's recomputed array equals the already-corrected array for every row, so
-- the IS DISTINCT FROM guard makes it a clean no-op (0 rows affected).
--
-- FORCED RLS unchanged — reports.scheduled_subscriptions uses plain ENABLE (not FORCE) ROW LEVEL
-- SECURITY, so the migration role updates across all companies without a bypass, exactly as the
-- original seed migration did.

BEGIN;

WITH normalized AS (
  SELECT
    s.uuid,
    COALESCE((
      SELECT array_agg(x.email ORDER BY x.first_ord)
      FROM (
        SELECT DISTINCT ON (lower(trim(e)))
          trim(e) AS email,
          ord AS first_ord
        FROM unnest(s.recipient_emails) WITH ORDINALITY AS u(e, ord)
        WHERE trim(e) <> '' AND lower(trim(e)) <> 'cpa@ih35dispatch.com'
        ORDER BY lower(trim(e)), ord
      ) x
    ), ARRAY[]::text[]) AS new_recipient_emails
  FROM reports.scheduled_subscriptions s
)
UPDATE reports.scheduled_subscriptions s
SET recipient_emails = n.new_recipient_emails,
    updated_at = now()
FROM normalized n
WHERE s.uuid = n.uuid
  AND n.new_recipient_emails IS DISTINCT FROM s.recipient_emails;

COMMIT;
