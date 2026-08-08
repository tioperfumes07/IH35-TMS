-- ACCT-F174 / LV-AP-VOID-MARKER-SPLIT — make void state AUTHORITATIVE on bills and invoices.
--
-- THE CARDS WERE WRONG ABOUT WHERE THIS COMES FROM, AND THAT MATTERS BEFORE READING THE FIX.
-- Three board cards (LV-AP-OPEN-INCLUDES-VOIDED, LV-VOID-INVARIANT-BOTH-WAYS,
-- LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS) state that "Void sets voided_at and nothing else — it never
-- moves status to void", and prescribe "set status = 'void' on void". Measured on prod
-- br-fancy-credit-akjnd07a 2026-08-07 (RLS-bypassed, RESET ROLE as its own statement):
--
--     accounting.bills — total 16,261 · voided_at set 4 · revoked_at set 0 · status='void' 0
--
-- BOTH canonical void implementations — voidBill (bills.service.ts:1790) and the governance executor
-- (governance/void-cancel-executors.ts:231) — already write
-- `SET status='void', revoked_at=now(), revoked_by_user_id, revoked_reason`. Not one row carries
-- revoked_at or status='void', so NEITHER PATH HAS EVER EXECUTED IN PRODUCTION. Following the cards
-- means editing code that already does what they ask — a no-op — while the rows stay wrong.
--
-- THE ACTUAL WRITER WAS A MIGRATION. All 4 rows carry voided_by_user_id NULL, the identical timestamp
-- 2026-08-07T00:33:50.999Z, and a void_reason naming its own author. Source, on disk:
-- 202612230000_bills_void_reason_and_tms_native_duplicate_guard.sql §2 —
--     UPDATE accounting.bills b SET voided_at = now(), void_reason = '…'
--       FROM ranked r WHERE b.id = r.id AND r.rn > 1;
-- It sets voided_at and void_reason and never status. The dedupe backfill created rows in precisely
-- the state the invariant forbids, and the Open-Bills KPI reads status.
--
-- WHICH IS THE WHOLE ARGUMENT FOR DOING THIS AS A CONSTRAINT RATHER THAN A CI GUARD. A migration is a
-- write path too, and it bypassed an invariant every application path honours. A static guard scans
-- application code; it cannot see a future migration, and a future migration is exactly what broke
-- this. The board's own precedence — "a DB constraint beats a guard, a guard beats a convention" —
-- points the same way.
--
-- BOTH DIRECTIONS ARE LIVE, AND THEY ARE DIFFERENT DEFECTS. A one-directional constraint would pass on
-- half the corrupt rows:
--     bills    — 4 rows: voided_at IS NOT NULL, status = 'unpaid'   (marker set, status not)
--     invoices — 1 row : status = 'void',       voided_at IS NULL   (status set, marker not)
-- The invoice row is INV-2026-00005, $2,450.00, and it is the row that made A/R aging overstate USMCA
-- receivables by 56.6% (ACCT-F171). No application path produces it: both invoice void writers
-- (invoices.routes.ts:849, void-cancel-executors.ts:297) set status AND voided_at together. The writer
-- is UNIDENTIFIED — which is stated plainly rather than guessed at, and is a further reason the
-- enforcement belongs in the database where an unknown writer still hits it.
--
-- IDEMPOTENT: every statement is guarded, so a re-run is a no-op. The data fixes are bounded by the
-- exact predicate the constraint enforces, so they cannot touch a healthy row.

BEGIN;

-- §1 — DATA, bills. Marker set, status not. 4 rows on prod, all USMCA, all TMS-native.
-- Scoped to `voided_at IS NOT NULL AND status <> 'void'` — the violation itself — so a correctly
-- voided row and a live row are both untouched. revoked_at is deliberately NOT stamped: these rows
-- were never revoked through the application path, and inventing a revocation timestamp would assert
-- something that did not happen.
UPDATE accounting.bills
   SET status     = 'void',
       updated_at = now()
 WHERE voided_at IS NOT NULL
   AND status IS DISTINCT FROM 'void';

-- §2 — DATA, invoices. Status set, marker not. 1 row on prod.
--
-- THE TIMESTAMP IS DERIVED, NOT INVENTED, and the row says so. We do not know when this invoice was
-- voided; we know its status is 'void' and that `updated_at` (2026-08-07T01:07:18.501Z) is the last
-- time anything changed it, which is the closest defensible evidence available. Stamping now() would
-- be a plain falsehood about when a $2,450.00 document was voided, in a system whose audit trail is
-- meant to survive a court. COALESCE keeps it honest if updated_at is somehow null.
--
-- void_reason is written because a void with no recorded reason is the same silent-state problem one
-- column over, and because the sibling table already carries a NOT VALID constraint requiring it
-- (bills_void_reason_required). The text names this migration so the derivation is never mistaken for
-- a real, observed void time.
UPDATE accounting.invoices
   SET voided_at   = COALESCE(voided_at, updated_at, created_at),
       void_reason = COALESCE(
         void_reason,
         'ACCT-F174 repair: status was ''void'' with voided_at NULL. Timestamp DERIVED from updated_at '
         || '— the true void time is unknown and was NOT invented. Original writer unidentified; no '
         || 'application path produces this state.'
       ),
       updated_at  = now()
 WHERE status = 'void'
   AND voided_at IS NULL;

-- §3 — ENFORCEMENT. Both tables, both directions.
--
-- NOT VALID first, then VALIDATE below: NOT VALID binds every FUTURE write immediately while skipping
-- the full-table scan, and VALIDATE then proves the existing 16,261 + 11,987 rows already comply. If
-- §1/§2 had missed a row, the VALIDATE fails loudly here rather than letting a broken invariant ship
-- as "enforced".
--
-- bills carry THREE void markers (voided_at, revoked_at, status) because two subsystems wrote them
-- independently. The constraint accepts EITHER timestamp as evidence of a void rather than picking a
-- winner — collapsing them is a separate piece of work, and a constraint is the wrong place to do a
-- data-model migration. What it forbids is the DISAGREEMENT: a timestamp without the status, or the
-- status without any timestamp.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'accounting' AND t.relname = 'bills'
       AND c.conname = 'bills_void_state_authoritative'
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_void_state_authoritative
      CHECK ((status = 'void') = (voided_at IS NOT NULL OR revoked_at IS NOT NULL))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'accounting' AND t.relname = 'invoices'
       AND c.conname = 'invoices_void_state_authoritative'
  ) THEN
    ALTER TABLE accounting.invoices
      ADD CONSTRAINT invoices_void_state_authoritative
      CHECK ((status = 'void') = (voided_at IS NOT NULL))
      NOT VALID;
  END IF;
END
$$;

-- §4 — VALIDATE. Proves the repair above was complete. A remaining violation aborts the migration.
ALTER TABLE accounting.bills    VALIDATE CONSTRAINT bills_void_state_authoritative;
ALTER TABLE accounting.invoices VALIDATE CONSTRAINT invoices_void_state_authoritative;

-- §5 — SCOPE, stated rather than implied. This migration covers accounting.bills and
-- accounting.invoices ONLY. The other money-document tables spell "voided" differently and each needs
-- its own measured predicate before it can be constrained — bill_payments uses `revoked_at`,
-- vendor_credit_applications uses `voided_reason`, payments uses `voided_at`. Copy-pasting this
-- constraint onto them would silently assert a pairing that does not exist there. They are bounded
-- explicitly here rather than left implicit, and remain open on the board.

COMMIT;
