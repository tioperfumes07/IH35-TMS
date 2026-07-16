# Handoff — Settlement collapse · QBO/balances collapse · Cutover · Relay (2026-07-15)

Purpose: exact current state + safe stopping points so Cursor can continue. **Nothing here touched prod
unsafely** — every migration is BUILD-AND-HOLD (registered HELD, `DO NOT RUN ON PROD`), and every change
was verified against the prod Neon branch `br-fancy-credit-akjnd07a`. Precedence: **prod-verified facts >
guard > repo > doc > memory; owner decisions are authority.**

---

## 0. THE SAFETY GATES CURSOR MUST NOT CROSS (why nothing is "done")

1. **A HELD migration MUST be applied by the owner on Neon + ledger-backfilled BEFORE its PR merges.**
   Verified 2026-07-15: `202607520000` (settlement Step-1) and `202607560000` (QBO Step-1) columns are
   **NOT on prod yet**. Merging a not-yet-applied HELD migration risks firing DDL on prod OR tripping the
   boot-refusal (`backend refuses to boot if a migration file is missing from the prod ledger`). **Do not
   merge #2526 / #2533 until the owner applies them on Neon.**
2. **Financial = build-and-HOLD, never self-merge.** migrations, `accounting.*` / `catalogs.*` / `mdata.*`
   (schema OR data), posting/GL, settlement money. Owner labels `JORGE-APPROVED` **after** the Neon apply.
3. **Migration numbers:** re-check `ls db/migrations | grep -oE '^[0-9]{12}' | sort | tail` **and all open
   PR branches** at push time. As of this handoff the max in-flight is **`202607560000`** (mine). Cascade
   holds `480000`–`510000`, `540000`, `550000`. **Take `202607570000`+.**
4. **§0 — prod wins.** The §10 LINKAGE map lists some tables as canonical that **don't exist on prod**:
   `maintenance.*`, `banking.reconciliation_matches` — prod only has `maint.*` / `bank.reconciliation_matches`.
   Those writers are CORRECT; do NOT "repoint" them (would 500). See memory
   `linkage-map-canonical-vs-prod-drift-maint-bank`.

---

## 1. MERGED + LIVE ON PROD (done)

- **#2522** Phase-1c approval CHECK + escrow FK (settlement) — applied on prod + merged.
- **#2523** P2.4a — approval.service repointed READS to canonical `driver_finance.driver_settlements` /
  `settlement_lines` (100× cents↔dollars boundary handled; reviewer-verified; db.test + guard
  `verify-settlement-approval-canonical`).
- **#2524** P2.4b — dead `GET /api/v1/settlements/:id` → 308 canonical redirect (CHAIN-07 guard extended).
- **#2532** Ch.11 cutover DOCS — opening **03/31/2026**, parallel live posting **04/01/2026**
  (supersedes 07/01/06-30). Surgical; historical 12/31/2024 anchor + memory refs untouched.
- **#2521** CONN-3 step 1 — Relay Fuel Wallet registered as a `banking.bank_accounts` row (merged earlier).

Prod backend deploy at handoff: health `version=756b7a6`.

---

## 2. SETTLEMENT ENGINE COLLAPSE (payroll.* → driver_finance.*)

**READ side = DONE** (#2523/#2524, merged). **WRITE side in progress:**

- **STEP 1 — #2526** `feat/settlement-collapse-step1-posting-linkage-cols-HOLD`
  Migration `202607520000` (sha `fd0cb21c492b9db79c8837d44de269472dce30c9ea2ad90b6f2a6c0e5b06f4c5`) — additive
  posting-linkage columns on `driver_finance.driver_settlements` (`accounting_bill_id`,
  `accounting_bill_payment_id`, `qbo_bill_id`, `qbo_bill_payment_id`, `posted_at`, `posted_by_user_id`,
  `bank_settle_date`, `created_by_user_id`) + `settlement_lines.posting_account_id` + reverse-drill indexes.
  **State:** green + `JORGE-APPROVED`, **but columns absent on prod → HOLD until owner applies on Neon.**
  Registered HELD; orphan-fk baselined; schema-parity regenerated.

- **STEP 2 — #2529 ✅ MERGED** (code only, no migration; retire landed on main 2026-07-16)
  **DECISION (GUARD): RETIRE, not repoint** — canonical is a strict superset (parity verified: cap math +
  net floor = `driver_finance/settlement-deduction-cap.service.ts` owner-locked; advance-recovery JE =
  `settlement-payrun-close.service.ts` via `advance_recovery` role, not hardcoded QBO-149; A/P bill =
  `settlement-bill-payment-posting.service.ts`). Archived `payroll/driver-settlement.service.ts` →
  `.deprecated.ts`; routes 308-redirect to canonical; **G4 guard** `verify-no-payroll-settlement-writes.mjs`
  fails CI on new `payroll.*` settlement writes. `JORGE-APPROVED`; the rename broke 4 guards + 2 allowlists — all fixed. MERGED on green.

- **STEP 3 — NOT BUILT (Cursor):** retire the **2 baselined dead-branch writers** in
  `settlements/auto-deductions/apply.ts` (`applyAutoDeductionsForSettlement`, already 0 callers) and
  `settlements/team-splits/apply.ts` (payroll else-branch under `useSettlementLines` — flag always true).
  Make canonical the only path, then shrink `scripts/verify-no-payroll-settlement-writes.baseline.json` to 0.
  No migration; verify with the G4 guard.

Facts memory: `settlement-engine-collapse-payroll-to-driverfinance-facts` (both RETIRE tables EMPTY on prod).

---

## 3. QBO DUAL-WRITE COLLAPSE / "BALANCES" (accounting.qbo_* → mdata.qbo_*)  ← sequence #3

- **STEP 1 — #2533** `feat/qbo-collapse-step1-mdata-qbo-sync-columns-HOLD`
  Migration `202607560000` (sha `7c26d993a75ad9b7870401ca352f9218ef71e6b74decc5944d15de9a173274ec`) — additive
  QBO push-status columns on `mdata.qbo_accounts/customers/vendors` (`sync_status`, `qbo_push_attempts`,
  `qbo_last_push_at`, `qbo_last_error` + accounts `parent_id`/`parent_synced` + vendors
  `default_ap_account_qbo_id`/`eligible_1099`/`payment_terms_qbo_id`), types/defaults mirrored from
  `accounting.qbo_*` exactly. **State:** HELD, CI running, no label yet → **HOLD until owner applies on Neon.**
  Registered HELD; orphan-fk baselined (`parent_id`, `default_ap_account_qbo_id`, `payment_terms_qbo_id`).

- **STEP 2 — NOT BUILT (Cursor), needs care:** repoint the push writers off `accounting.qbo_*` onto
  `mdata.qbo_*`: `sync/qbo-accounts-push.ts`, `sync/qbo-customers-push.ts`, `sync/qbo-vendors-push.ts`,
  `onboarding/usmca-carrier-bootstrap.ts`. **⚠ Both mirrors carry LIVE, DIVERGENT data** (verified: mdata is
  fuller — accounts 1651 vs 1647, customers 2684 vs 2655, vendors 2776 vs 2744). Step-2 MUST **reconcile
  which rows exist where** before archiving `accounting.qbo_*` (this is NOT the empty-table case the
  settlement collapse was). Add a G4-style guard forbidding new `accounting.qbo_*` writes once repointed.
  Gated on #2533 columns being applied on prod first.

- **STEP 3 — NOT BUILT:** archive `accounting.qbo_*` (void-not-delete) once Step-2 verified live.

Memory: `linkage-map-canonical-vs-prod-drift-maint-bank` (which "RETIRE" writes are real vs false-positive).

---

## 4. OPENING-BALANCE IMPORT (cutover §2/§3) — BLOCKED ON OWNER

`apps/backend/src/accounting/opening-balance-import/*` is the **12/31/2024 HISTORICAL clone** opening
(`TRANSP_OPENING_BALANCE_AS_OF="2024-12-31"`, JE date `2025-01-01`, 208 hand-verified QBO-BS lines). **It was
NOT changed** — relabeling it 03/31/2026 would falsify audit/court data and break the tie-out ceremony
(§8.5 keeps the 2024 conversion unchanged).
**Cursor CANNOT build the Ch.11 03/31/2026 opening until the owner provides the 03/31/2026 QBO Balance Sheet
figures** and decides **coexist vs replace** (new `transp-2026-03-31-source.ts` alongside the historical
clone, vs replacing it). Depends on QBO collapse (#3) landing first (§2 mapping needs canonical `mdata.qbo_accounts`).

---

## 5. RELAY (CONN-3) — step 1 done, steps 2/3 NOT BUILT

- **DONE:** #2521 registered the Relay Fuel Wallet as a `banking.bank_accounts` depository row
  (`catalogs.accounts` #1295, `system_purpose='relay_fuel_wallet'`). Ingest/classifier/deposit-review code
  already exists under `apps/backend/src/integrations/relay-payments/`.
- **NOT BUILT (Cursor):** the 3-layer Relay **booking** service (behind a new default-OFF flag) that books
  wallet fuel transactions to the ledger + the wallet-transaction UI (step 3). **Gated on owner design
  decisions** (per memory `relay-deposit-funding-classification`: the 3 funding layers were never summed;
  personal-card deposits = owner loan/capital, not company cash; 6 external cards need owner naming).
  Relay booking touches money → build-and-HOLD.

---

## 6. NOT MY LANE (Cascade owns — do not touch from here)
- **#2527** `feat/gate-driver-advance-gl` — failing: migration `202607480000` LOST its `DO NOT RUN ON PROD`
  marker (1-line fix in the file header).
- **#2528** `feat/entity-isolation-opco-rls` — failing: `202607490000`/`500000`/`510000` lost the marker.
- **#2530** audit-log comment, **#2531** CUSTOMER_PAYMENT TRANSP override, **#2525** USMCA docs.

---

## 7. SAFE STOP FOR THIS AGENT
Everything above is either merged-and-live (§1) or **BUILD-AND-HOLD with prod untouched**. The clean
continuation points for Cursor are the **NOT BUILT** items: settlement Step-3, QBO collapse Step-2/3 (after
#2533 applied), opening-balance 03/31/2026 (after owner figures), relay booking steps 2/3. **First unblocker
for the owner:** apply `202607520000` (#2526) and `202607560000` (#2533) on Neon + ledger-backfill, then those
two merge; that clears the schema path for both Step-2s.
