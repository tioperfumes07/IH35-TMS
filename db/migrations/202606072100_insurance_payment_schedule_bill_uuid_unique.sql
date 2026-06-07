-- Block 5 / GAP-86 forward-fix — belt-and-suspenders against duplicate bill links.
--
-- ADDITIVE ONLY. insurance schema + grants already live; bill_uuid column added by
-- #687 (db/migrations/202606071800_insurance_bill_schedule_link.sql). This adds a
-- partial UNIQUE index so the SAME accounting bill can never be linked to two
-- insurance.payment_schedule rows. Each createBill() yields a fresh bill id, so no
-- existing duplicates exist; the index is safe to create.
--
-- NOTE: intentionally NOT a unique index on (tenant_id, policy_id, due_date) — the
-- down payment and installment 1 may legitimately share the policy effective date.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_insurance_payment_schedule_bill_uuid
  ON insurance.payment_schedule (bill_uuid)
  WHERE bill_uuid IS NOT NULL;

COMMIT;

-- DOWN (manual rollback):
-- DROP INDEX IF EXISTS insurance.ux_insurance_payment_schedule_bill_uuid;
