# IH35-TMS — LOCKED DECISIONS (single source of truth)
Last locked: 2026-06-08 by Jorge. Repo doc WINS over any handoff/STATUS/memory. Do not re-ask Jorge any item below.

## 1. SIDEBAR — FINAL ORDER (additive, owner-locked)
> **Count source of truth = `apps/frontend/src/components/layout/sidebar-config.ts` (`SIDEBAR_ITEM_IDS`),
> enforced by `scripts/verify-sidebar-contract.mjs`. It is currently 28 items (render count is role-dependent;
> `eld` is a hidden stub). The historical list below is kept for record; the live array (now 28) is
> authoritative — do not trust a hardcoded number here.**

Historical id order (left rail, top→bottom):
  1 home          9 eld
  2 maintenance  10 cash-flow        ← MODULE, between eld and accounting
  3 fuel         11 accounting
  4 dispatch     12 bank
  5 driver-hub   13 factoring
  6 safety       14 vendors
  7 drivers      15 customers
  8 insurance    16 legal
                 17 form_425
                 18 drv_app
                 19 lists
                 20 reports
                 21 docs
                 22 users
                 23 help

RULES:
- ADDITIVE ONLY. Never remove, never reorder. Only Jorge changes this list, in writing.
- driver-hub (#5) and cash-flow (#10) are NEW; "drivers" relabels to "Driver Profile" in place.
- Any change to this array changes verify-sidebar-contract.mjs + ALL sidebar docs IN THE SAME PR.
- Current main is the 21-array; it grows to 23 only as driver-hub and cash-flow blocks land.

## 2. CASH FLOW — it is a MODULE, not a report
- Top-level route /cash-flow. Sidebar #10 (between eld and accounting).
- DO NOT touch /reports/cash-flow-statement or /reports/cash-flow-overview.
- Tabs: "Daily prediction" + "Actual vs Projected".
- TOGGLES LOCKED: (1) income = GROSS rate-confirmation. (2) driver pay = DELIVERY date (settlement-date setting available). (3) opening + projected closing cash = INCLUDED. (4) 7-day predicted-net strip = INCLUDED.
- All reads via existing accounting + driver_finance services. Manual add-ins in cash_flow_adjustments. ARCHIVE never DELETE.

## 3. INSURANCE — financial-write pattern (locked by GO-737)
- Atomic multi-table writes on ONE client inside withCurrentUser BEGIN/COMMIT.
- Financial MATH delegated to existing computeInsuranceDispersal. NO new ledger math.
- Bills idempotency-keyed (ins:{policyId}:{seq}), audited, QBO via enqueueAccountingOutbox.
- FOLLOW-UP: extract createBill core into client-accepting helper (tracked, not blocking).

## 4. INSURANCE ↔ SAFETY connection
- insurance.policy_unit_coverages holds coverage_type/limit/deductible/insured_value.
- Insurance OWNS; Safety READS + flags, never writes.
- Active unit + no active coverage = ALERT. OOS/in-shop/sold = EXPECTED.

## 5. PROCESS LOCKS
- Repo docs WIN over handoff/STATUS/memory. Verify LIVE before merge GO.
- One writer per magnet file per cycle. Lane locks enforced by block-ready gate.
- NEVER DEFER: fix in the PR that surfaced it + add CI guard.
- Block header: "AGENT-N · Block N of M — PHASE / TASK <tracker-id> — Title".

## 6. ANTI-REGRESSION CI GUARDS
6.1 verify-sidebar-contract.mjs — assert exact array; assert never-remove for all ids; assert cash-flow between eld and accounting.
6.2 verify-cashflow-module.mjs — assert /cash-flow top-level; assert does NOT import /reports/cash-flow-*; assert between eld and accounting.
6.3 verify-insurance-financial-writes.mjs — assert insurance delegates math to computeInsuranceDispersal; no new journal debit-credit; bill writes carry idempotency key.
6.4 verify-additive-only (sidebar) — fail if any id in locked 23-array is missing from SIDEBAR_ITEM_IDS.

## 7. QBO-PARITY UI SYSTEM (locked 2026-06-08)
See `docs/specs/qbo-parity/QBO_PARITY_UI_SYSTEM.md` (design law).
7.1 **Location dimension = driver/operator.** IH35 uses the QBO Location field to mean driver/operator; map Location→driver in TMS (CPA to confirm).
7.2 **CoA page must render the QBO-mirror, not the local-seed.** Root cause of "CoA showing wrong accounts" = dual datasets (page = ~50-row local seed; posting engine = ~199 QBO-mirror accounts via `/api/v1/mdata/accounts`). Repoint page/register/role-bindings at the QBO-mirror, RLS-scoped. **GATED — Task 0 data-source audit + Jorge OK before changing.** Do NOT disconnect QBO; bug is internal (dual datasets).
7.3 **Inline "+ Add new" is mandatory in every reference dropdown software-wide** (Category, Class, accounts, Payee, Vendor, Customer, Item, Terms, Payment method, Location). Opens an inline mini-create without closing the parent; returns with the new value selected. Account dropdowns KEEP the existing TMS lock-account control alongside.
7.4 **Sizing:** create/edit panels = bounded right drawers ~30% viewport (~576–582px); transaction editors (Expense/Bill/Check/Invoice/etc.) = full-page (the exception); match/reconcile summaries = sticky bottom bar.
7.5 **Every data table uses the shared QBO-parity table grammar** with density toggle (Regular/Compact/Ultra-compact) + configurable per-page. This is the fix for "TMS too wide/too large."
