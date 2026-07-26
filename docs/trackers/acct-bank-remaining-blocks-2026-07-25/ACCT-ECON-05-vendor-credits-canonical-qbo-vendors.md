# ACCT-ECON-05 — vendor credits · canonical QBO vendor masters + one live credit
**FINDING:** ACCT-ECON-05 (P0, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** accounting.
**Scoreboard:** `docs/module-completion/accounting.json` · **NOT** a projection-flag chase (distinct from ACCT-ECON-03/04).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: docs/specs/CURSOR-PERMANENT-RULES.md · docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md (vendors / AP) · docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md · docs/specs/IH35_ARCHITECTURAL_DESIGN.md (module accounting) · docs/lockdown/00_LOCKED_DECISIONS.md §8 parallel books · docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md · docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md (linkage / RETIRE tables)
Approved screens reviewed: docs/approved-screens/3AccountingDropdown.png · vendor / bill surfaces as applicable
Tab count check (Rule 05): design tabs for accounting unchanged unless Fix adds a design-approved leaf (then update design same commit)
Deviations from spec: None
NEW SPEC items (Rule 01): None — Fine GL already OWNER-decided (Safety); do not re-ask. Projection flags stay OFF until final cutover.

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25 Neon lucia · br-fancy-credit-akjnd07a]
**Root defect class: LINKAGE**, not “missing vendor-credit UI math.”
- `to_regclass('accounting.qbo_vendors')` = live · `to_regclass('mdata.qbo_vendors')` = live (RETIRE namespace per Rule 14 — do not write new FKs here).
- Neon lucia 2026-07-25: `accounting.qbo_vendors` **2744** · `mdata.qbo_vendors` **2780** (Δ≈36 still only on retired mirror).
- `accounting.vendor_credits` / `vendor_credit_applications` density still **0** on prod (honest empty until one live apply).
- Prior bridge work (#3426 / step 1436) fixed picker UUID mismatch on throwaway PG; **PASS still blocked** until entity masters are fully in the **canonical** namespace and one TRANSP (and USMCA if used) credit is applied live.

**Step 1 — reproduce (Rule 10, lucia):**
```sql
BEGIN;
SELECT set_config('app.bypass_rls','lucia',true);
SELECT count(*) FROM accounting.qbo_vendors;
SELECT count(*) FROM mdata.qbo_vendors;
SELECT count(*) FROM accounting.vendor_credits;
SELECT count(*) FROM accounting.vendor_credit_applications;
-- writers still targeting mdata.qbo_vendors?
ROLLBACK;
```
Plus browser: Vendor Credits create → apply to bill → reload → reverse drill bill→credit (TRANSP **and** USMCA).

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `accounting.qbo_vendors` (and `mdata.vendors` for AP truth) — **never** new writes/FKs to RETIRE `mdata.qbo_vendors`.
2. Hub matrix: `org.companies` · `mdata.vendors` · `accounting.qbo_vendors` · `accounting.bills` · `accounting.vendor_credits` · `accounting.vendor_credit_applications` · `accounting.journal_entries` (when posting flag ON) — BOTH-WAY.
3. Cross-module: Accounting Bills/Credits · Vendors list · (optional) Banking bill-pay match — drill F+R.
4. Deployed SHA vs origin/main: coder fills at build via `/api/v1/healthz/shallow`.

## STANDARD (Rule 15)
QuickBooks Vendor Credit / Bill Credit apply · NetSuite AP credit memo controls · US GAAP liability reduction · RLS/WORM. Match QBO: credit reduces open AP for the **same vendor**, entity-scoped.

## NEVER-DELETE (Rule 07) + LOCKED INVARIANTS (Rule 04) + Rule 13
Additive migrate/backfill only — do **not** DROP `mdata.qbo_vendors`. Archive/repoint writers. No new GL math — reuse existing vendor-credit poster. **Parallel posting / projection flags stay OFF** until owner final cutover (do not flip `QBO_*_PROJECTION_ENABLED`). **OWNER decides** economics (OWNER-only decision language). Fine GL already decided — no re-ask.

## THE FIX (requirement-level)
1. Inventory every reader/writer still on `mdata.qbo_vendors` for vendor-credit / bill apply paths; repoint to **canonical** `accounting.qbo_vendors` (and `mdata.vendors` where AP identity is required).
2. Owner Neon-applies an **additive** backfill migration: copy any missing entity-scoped QBO vendor masters from retired mirror → `accounting.qbo_vendors` (idempotent, dynamic `org.companies`, FORCE RLS, no hardcoded UUIDs). Δ target: lucia counts converge (or residual explained + OWNED).
3. Prove one **live** vendor credit create+apply on TRANSP (and USMCA if that entity uses AP credits) with reverse drill — or OWNER written acceptance of honest-empty with named tracker (Rule 16 deferral only).
4. Keep projection flags OFF. Scoreboard ACCT-ECON-05 stays FAIL/UNVERIFIED until live row or owner acceptance.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-acct-econ-05-canonical-qbo-vendors.mjs` + `scripts/verify-steps/NNNN-…` (NEVER edit package.json / ci.yml / locked-guards.yml).
Must FAIL if bill/credit apply path still FK/joins RETIRE `mdata.qbo_vendors` as write target; PASS when canonical namespace is the write/read path. Keep `verify-vendor-credit-live-path` (1436) for lifecycle.

## ACCEPTANCE
- Neon lucia: canonical masters populated; residual RETIRE-only rows explained or 0-gap.
- One live `vendor_credits` (+ application) row under lucia **or** OWNER acceptance of honest-empty.
- Browser TRANSP+USMCA apply + reverse drill — OR `UNVERIFIED: <blocker>`.
- Flags still OFF.

## GIT-GATE COMMIT KEYS (all 18)
FINDING: ACCT-ECON-05
LANE: FINANCIAL-HOLD
DOD-A: UNVERIFIED — active vendor-credit path at build
DOD-B: UNVERIFIED — wizard fields in submit
DOD-C: FAIL until canonical `accounting.qbo_vendors` is the linked master (RETIRE writes = FAIL)
DOD-D: UNVERIFIED — credit reduces correct AP vendor
DOD-E: UNVERIFIED — need live credit or owner honest-empty
VERIFY-1..5: UNVERIFIED at build
VERIFY-6: PASS target — flags OFF; no TMS→QBO write-back; OWNER decides cutover
VERIFY-7: PASS target — no invented tabs
VERIFY-8: UNVERIFIED — FORCE RLS on touched tables
MODULE_PROGRESS: accounting N of M (after this PR’s scoreboard honesty)
ITEMS_TOUCHED: ACCT-ECON-05
MIGRATE: owner Neon-applies additive backfill (number > main max + unapplied held) / idempotent / FORCE RLS / throwaway validate
ROOT CAUSE: vendor-credit economics depend on QBO vendor masters in the canonical namespace; RETIRE `mdata.qbo_vendors` still holds residual masters and historical writers — linkage gap blocks a trustworthy live credit.
FIX: backfill+repoint to `accounting.qbo_vendors` / `mdata.vendors`; one live credit; guards pin canonical path
GUARD: verify-acct-econ-05-canonical-qbo-vendors + 1436
LIVE PROOF: UNVERIFIED: no live vendor_credit row yet; Neon lucia counts 2744/2780 verified 2026-07-25
REMAINING: owner Neon-apply backfill · one live credit · browser hydrate
