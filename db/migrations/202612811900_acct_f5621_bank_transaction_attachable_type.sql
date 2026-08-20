-- FINDING: ACCT-F5621 — per a cross-seat coordination broadcast (Cursor, 2026-08-20), bank-row
-- attachments/notes stay disabled in the Banking UI because `documents.attachments.entity_type`'s
-- CHECK constraint does not admit `'bank_transaction'` among its ~20 allowed values. A dedicated CI
-- honesty guard (scripts/verify-banking-attachments-notes-honesty.mjs) already documents and enforces
-- the disabled state rather than pretending the feature is Built. This migration is the DB half of
-- lifting that block; the code half (backend Zod enum + a new notes PATCH route + frontend wiring)
-- ships in the same PR.
--
-- CANONICAL-CHECK: no existing entity_type value represents a bank transaction. `'transfer'` already
-- exists in the list but represents a different concept (an accounting.bank_transfers-style movement
-- record, not the underlying banking.bank_transactions row) -- confirmed by grepping every backend
-- caller of the attachments routes with entity_type='transfer' before ruling this a distinct type
-- rather than reusing 'transfer'. `'bank_transaction'` is a genuinely new, additive value.
--
-- WHY A CHECK-WIDEN, NOT A NEW COLUMN/TABLE: documents.attachments is already the universal,
-- entity_type-polymorphic attachment store every other module (bills, invoices, loads, work orders,
-- etc.) uses — adding a parallel bank-specific attachments table would fragment the pattern for no
-- reason. The RLS policy (0106) is already generic/company-scoped and entity-type-agnostic, so no RLS
-- change is needed here.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, guarded by to_regclass for fresh-DB safety
-- (mirrors 202612811700's own shape). The value list below is reproduced from the LIVE constraint
-- definition on prod (queried directly, 2026-08-20: conname attachments_entity_type_check), not
-- retyped from the migration file, so a future drift between the two can never silently narrow the
-- live set.
-- FRESH-DB SAFE: pure DDL on a table that already exists by this point in the chain (0106). No RAISE,
-- no data dependency, no rows required to satisfy the new CHECK.
-- NO RLS/GRANT CHANGE: documents.attachments already carries FORCED... (ENABLE) RLS + standard grants
-- from 0106; this migration touches only the entity_type CHECK.

DO $$
BEGIN
  IF to_regclass('documents.attachments') IS NOT NULL THEN
    ALTER TABLE documents.attachments
      DROP CONSTRAINT IF EXISTS attachments_entity_type_check;
    ALTER TABLE documents.attachments
      ADD CONSTRAINT attachments_entity_type_check
      CHECK (entity_type IN (
        'load','work_order','bill','expense','invoice','payment',
        'estimate','driver_charge','vendor_chargeback','customer_adjustment',
        'damage_report','severe_repair','dispute','transfer','journal_entry',
        'driver','customer','vendor','unit','equipment','manual',
        -- NEW — ACCT-F5621
        'bank_transaction'
      ));
  END IF;
END $$;
