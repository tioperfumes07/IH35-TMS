-- ORPH-003 — vendor detail has no structured ACH/bank-account field.
--
-- ROOT CAUSE: apps/frontend/src/pages/Vendors.tsx's buildAchDisplay() renders "ACH on file" purely
-- by string-matching the word "ach" anywhere in vendor.notes free text — no structured payment-method
-- record exists anywhere in the schema (grepped both frontend and every accounting/vendor backend
-- route: zero ach_/routing_number/bank_account_number columns). This is a false-positive/false-
-- negative risk the repo's own audit already named and prescribed a fix shape for:
-- docs/specs/CURSOR-AUDIT-2026-07-15/modules/15-CUSTOMERS-VENDORS.md §5 item 5 — "Replace notes
-- heuristic with structured payment-method records (or explicit 'not on file') before any Bill Pay
-- automation."
--
-- DESIGN, mirroring the existing banking.bank_accounts security posture (account_mask, never a full
-- number): this table stores a MASKED reference only (last 4 digits), never a full account or
-- routing number. This system has no automated ACH origination today — a vendor payment is recorded
-- (accounting.bill_payments) after being sent through an external bank/ACH origination flow, never
-- initiated from here — so full bank credentials are neither needed operationally nor safe to hold
-- in this table. If true ACH origination automation is ever built, that is a separate, dedicated
-- security-reviewed project, not an incidental widening of this table.
--
-- CANONICAL-CHECK: driver_finance.driver_payment_methods is the canonical per-DRIVER disbursement
-- method (how a driver is PAID OUT via settlement). mdata.vendor_payment_methods is a distinct
-- concept: how a VENDOR is paid (bill-pay reference, inbound to no ledger of its own — a bill payment
-- still posts through accounting.bill_payments). Opposite money-flow direction, opposite party type,
-- no shared rows or FK — not a duplicate ledger, no collision with driver_payment_methods.

CREATE TABLE IF NOT EXISTS mdata.vendor_payment_methods (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  vendor_id             uuid NOT NULL REFERENCES mdata.vendors(id),
  method_type           text NOT NULL CHECK (method_type IN ('ach', 'check', 'wire', 'other')),
  bank_name             text,
  -- Last 4 digits only (or any short masked reference an operator wants on file) — never a full
  -- account or routing number. Enforced at the DB layer, not just by convention: a value that looks
  -- like a real 8+ digit account/routing number is rejected outright.
  account_mask          text
    CHECK (account_mask IS NULL OR (length(account_mask) <= 4 AND account_mask !~ '^\d{5,}$')),
  is_primary            boolean NOT NULL DEFAULT false,
  notes                 text,
  created_by_user_id    uuid REFERENCES identity.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- void-not-delete: flip deactivated_at, never DELETE. void_reason mirrors the
  -- maintenance.parts_invoice_links (ACCT-F5756) precedent for this exact same-shape column set.
  deactivated_at        timestamptz,
  void_reason           text,
  voided_by_user_id     uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS vendor_payment_methods_vendor_idx
  ON mdata.vendor_payment_methods (vendor_id)
  WHERE deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS vendor_payment_methods_opco_idx
  ON mdata.vendor_payment_methods (operating_company_id)
  WHERE deactivated_at IS NULL;

-- At most one PRIMARY active payment method per vendor (partial unique index, not a CHECK — CHECK
-- cannot reference sibling rows).
CREATE UNIQUE INDEX IF NOT EXISTS vendor_payment_methods_one_primary_per_vendor
  ON mdata.vendor_payment_methods (vendor_id)
  WHERE is_primary AND deactivated_at IS NULL;

-- ── Entity-scoped FORCED RLS (canonical predicate) ─────────────────────────────────────────────────
ALTER TABLE mdata.vendor_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.vendor_payment_methods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_payment_methods_entity_select ON mdata.vendor_payment_methods;
DROP POLICY IF EXISTS vendor_payment_methods_entity_write  ON mdata.vendor_payment_methods;
CREATE POLICY vendor_payment_methods_entity_select ON mdata.vendor_payment_methods FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY vendor_payment_methods_entity_write ON mdata.vendor_payment_methods FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])));

-- ── Grants to the runtime role. NO DELETE (soft-delete via deactivated_at). ─────────────────────────
-- mdata carries ALTER DEFAULT PRIVILEGES that auto-grant DELETE on every new table (same landmine as
-- dispatch, per the ih35-financial-migrations skill) -- a narrow GRANT alone is not enough; explicitly
-- REVOKE DELETE so has_table_privilege('ih35_app', ..., 'DELETE') is actually false, not just un-granted.
GRANT SELECT, INSERT, UPDATE ON mdata.vendor_payment_methods TO ih35_app;
REVOKE DELETE ON mdata.vendor_payment_methods FROM ih35_app;
