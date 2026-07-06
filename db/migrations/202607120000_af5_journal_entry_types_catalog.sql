-- [HOLD-FOR-JORGE — TIER 1] AF-5 — catalogs.journal_entry_types (turn the last real STUB catalog real)
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. DO NOT flip any posting flag. ***
-- This migration is BUILT-SOLO-AND-HELD. It touches `catalogs.*` (financial cluster, constitution
-- §1.4) — never self-merge. Run on a Neon branch by Jorge/GUARD, verify, then ledger-backfill.
--
-- WHY: the 2026-06-24 stub-catalog recon (docs/recon/stub-inventory-2026-06-24.md) re-audited all 61
-- live AllCatalogsMap tiles and found the "~34 stub catalogs" estimate stale — 54/61 are already REAL.
-- Exactly ONE tile is still a true SILENT-STUB: **Journal Entry Types**
-- (apps/backend/src/catalogs/accounting/factory.ts:512-583,
--  registerJournalEntryTypesReadOnlyRoutes) — it serves a hardcoded in-file 3-row array with synthetic
-- fixed UUIDs/epoch timestamps; there is no backing table; writes already correctly 405
-- ("catalog_read_only"). This migration creates the real table so the catalog serves real rows with
-- real ids/timestamps, matching the READ-ONLY-LIST class already used for Posting Templates and
-- Account Role Bindings (real table, GET-only by design, catalogs/accounting/factory.ts
-- registerLegacyAccountingCatalogRoutes({ readOnly: true, ... })).
--
-- NOTE on "expense categories" / "account subtypes" (the other two examples named in the AF-5 task):
-- BOTH already exist and are real — catalogs.expense_categories (migration 0152) and
-- catalogs.detail_types + catalogs.account_types (migrations 202606080010 / 202607011700, exposed at
-- GET /api/v1/accounting/account-type-catalog + /api/v1/catalogs/accounting/detail-types). No action
-- needed there; see docs/accounting/AF-1-AF-5-DESIGN.md for the full verification trail.
--
-- SCOPE NOTE (flagged, not silently resolved): the 4 "names_master" tiles marked live:false
-- (Shippers, Consignees, Lenders, Insurance Carriers — apps/frontend/.../AllCatalogsMap.tsx:146-150)
-- are HONESTLY marked "In preparation" (not faked) and are NOT simple reference catalogs — they would
-- be canonical-naming/dedup registries against free-text load-stop / vendor / policy fields, which is
-- a materially different, larger data-model decision (dedup key, backfill source, merge workflow).
-- Left OUT of this AF-5 cut; tracked as a follow-up in docs/accounting/AF-1-AF-5-DESIGN.md.
--
-- DESIGN: catalogs.journal_entry_types is a GLOBAL shared taxonomy (no operating_company_id) — same
-- shape as the existing catalogs.account_types / catalogs.posting_templates global reference tables,
-- because a JE "source/purpose" classification (General Journal, Sales Invoice, ...) is not an
-- entity-owned business record, it is a shared label taxonomy every entity reads identically (exactly
-- like Account Type). void-not-delete: is_active flag only, no DELETE grant. FORCE RLS + open read
-- policy (non-sensitive reference labels only — matches the reference.* schema convention, migration
-- 0340) — actual write protection is enforced at the API layer (readOnly: true -> 405 on
-- POST/PATCH/DELETE), consistent with the existing Posting Templates / Account Role Bindings pattern.
--
-- Idempotent, atomic, self-contained GRANTs. CI fresh-DB validates from-migrations. Posts nothing;
-- no FK from any posting/GL table references this catalog (verified: no `journal_entry_type_id`
-- column exists anywhere in db/migrations/ as of this migration).

BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

CREATE TABLE IF NOT EXISTS catalogs.journal_entry_types (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text        NOT NULL,
  display_name text        NOT NULL,
  description  text,
  sort_order   int         NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entry_types_code
  ON catalogs.journal_entry_types (lower(code));
CREATE INDEX IF NOT EXISTS idx_journal_entry_types_active_sort
  ON catalogs.journal_entry_types (is_active, sort_order);

-- FORCE RLS — global reference table (0340 reference-schema convention): open SELECT to the app role;
-- writes are blocked at the API layer (readOnly catalog), so the DB write policy is a defensive
-- fail-closed default, not the primary control. No DELETE grant (void-not-delete via is_active).
ALTER TABLE catalogs.journal_entry_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.journal_entry_types FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_entry_types_read ON catalogs.journal_entry_types;
CREATE POLICY journal_entry_types_read ON catalogs.journal_entry_types
  FOR SELECT TO ih35_app
  USING (true);

DROP POLICY IF EXISTS journal_entry_types_write ON catalogs.journal_entry_types;
CREATE POLICY journal_entry_types_write ON catalogs.journal_entry_types
  FOR ALL TO ih35_app
  USING (true)
  WITH CHECK (true);

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.journal_entry_types TO ih35_app;

-- Seed — QBO-parity + TMS-specific JE source/purpose taxonomy (supersedes the 3-row hardcoded stub;
-- the original GENERAL / SALES_INVOICE / PAYMENT_RECEIPT codes are preserved verbatim so no consumer
-- of those exact `code` values breaks).
INSERT INTO catalogs.journal_entry_types (code, display_name, description, sort_order)
VALUES
  ('GENERAL',           'General Journal',                 'Manual and adjustment entries',                                   10),
  ('ADJUSTING',         'Adjusting Entry',                  'Period-end adjusting/reclass entries',                            20),
  ('OPENING_BALANCE',   'Opening Balance',                  'Owner-entered opening balance entries (BS-only, signed-actual)', 30),
  ('SALES_INVOICE',     'Sales Invoice',                    'AR invoice posting entries',                                      40),
  ('PAYMENT_RECEIPT',   'Payment Receipt',                  'Customer payment application entries',                            50),
  ('CREDIT_MEMO',       'Credit Memo',                      'AR credit memo entries',                                          60),
  ('BILL',              'Bill',                             'AP bill posting entries',                                         70),
  ('BILL_PAYMENT',      'Bill Payment',                     'AP bill payment entries',                                         80),
  ('VENDOR_CREDIT',     'Vendor Credit',                    'AP vendor credit entries',                                        90),
  ('DEPOSIT',           'Deposit',                          'Bank deposit entries',                                           100),
  ('TRANSFER',          'Transfer',                         'Inter-account / inter-entity transfer entries',                  110),
  ('PAYROLL_SETTLEMENT','Driver Settlement',                'Driver settlement / payroll-equivalent posting entries',         120),
  ('FACTORING_ADVANCE', 'Factoring Advance',                'Secured-borrowing factoring advance/reserve entries',            130),
  ('ESCROW_ENTRY',      'Escrow Entry',                     'Driver damage-claim escrow liability entries',                   140),
  ('DEPRECIATION',      'Depreciation',                     'Fixed-asset depreciation entries',                               150),
  ('RECLASSIFICATION',  'Reclassification',                 'Account-to-account reclass entries',                             160)
ON CONFLICT (lower(code)) DO NOTHING;

COMMIT;
