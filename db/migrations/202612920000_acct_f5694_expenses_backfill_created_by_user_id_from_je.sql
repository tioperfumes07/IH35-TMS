-- ACCT-F5694 — closes the historical-backfill half of LV-EXPENSES-UNAUDITED-AND-ACTORLESS.
--
-- The going-forward half was fixed 2026-08-17: all human-actor expense writers now stamp
-- created_by_user_id on create (expenses.routes.ts, two-section-service.ts's
-- autoCreateExpenseFromWO, lumper-cash-advance-split.ts's disburseCashAdvanceSplit). The audit
-- trigger half was also already fixed (accounting.expenses / accounting.invoice_lines both carry
-- tg_audit_row today). What was left: TMS-native (qbo_purchase_id IS NULL) expense rows created
-- BEFORE the 2026-08-17 fix still carry created_by_user_id = NULL, so no query can establish who
-- created them — precisely the audit gap a CPA/auditor/court would test, and directly relevant
-- given this repo's active Ch.11 litigation context.
--
-- Live-verified 2026-08-21 (Neon prod tiny-field-89581227, RLS-immune bypass): 23 TMS-native
-- expenses with created_by_user_id IS NULL, dated 2026-08-02..2026-08-13 (all predate the fix).
-- Every one of the 23 resolves to EXACTLY ONE actor via its own posted journal entry
-- (accounting.journal_entry_postings -> journal_entries on source_transaction_type='expense' /
-- source_transaction_id = expense.id), because journal_entries.created_by_user_id was never
-- broken — only accounting.expenses was. No ambiguity: verified zero expenses among the 23 join
-- to more than one distinct actor.
--
-- THIS IS NOT A GUESS: it reads the actor off the SAME request's own GL entry (written ~100ms
-- later in the original request, per the original P1 finding's own proof), not an inferred
-- default. Dynamic UPDATE...FROM JOIN, not a hardcoded id/row list — self-heals any future orphan
-- of the identical shape (a TMS-native expense whose actor stamp was lost but whose JE still has
-- one), rather than being a one-time fixed-list patch. Idempotent: a row only qualifies while
-- created_by_user_id IS NULL, so a second run is a no-op. No-op on a fresh CI DB (no such rows
-- exist pre-seed). No trigger on accounting.expenses blocks this UPDATE (only a deferred
-- total/lines-match constraint trigger and tg_audit_row, both correctly unaffected/correctly
-- record the correction).
--
-- Numbered 202612920000 — strictly above prod ledger max 202612900100 (verified 2026-08-21).
-- Claimed via db/migrations/CLAIMED-MIGRATION-NUMBERS.json before this file was authored.

DO $$
DECLARE
  v_updated int;
BEGIN
  UPDATE accounting.expenses e
     SET created_by_user_id = je.created_by_user_id,
         updated_at = now()
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
   WHERE jep.source_transaction_type = 'expense'
     AND jep.source_transaction_id = e.id::text
     AND e.created_by_user_id IS NULL
     AND e.qbo_purchase_id IS NULL
     AND je.created_by_user_id IS NOT NULL
     -- Skip any expense whose matching JEs disagree on actor — never guess when ambiguous.
     AND (
       SELECT count(DISTINCT je2.created_by_user_id)
         FROM accounting.journal_entry_postings jep2
         JOIN accounting.journal_entries je2 ON je2.id = jep2.journal_entry_uuid
        WHERE jep2.source_transaction_type = 'expense'
          AND jep2.source_transaction_id = e.id::text
          AND je2.created_by_user_id IS NOT NULL
     ) = 1;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'ACCT-F5694: backfilled created_by_user_id on % TMS-native expense row(s) from their own posted JE actor', v_updated;
END $$;
