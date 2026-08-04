# IH35-TMS — LOCKED DECISIONS (single source of truth)
Last locked: 2026-06-08 by Jorge. Repo doc WINS over any handoff/STATUS/memory. Do not re-ask Jorge any item below.

> **OWNER LAW (2026-08-03, FINAL) governs merge/Neon-apply mechanics referenced anywhere below: NO HOLDS, NO
> owner-approval merge label — every coder has FULL Neon access and merge authority in every lane. See
> `.cursor/rules/00-operating-method-LAW.mdc` (governance section). The business/accounting DECISIONS in this
> file remain locked and unchanged; only "coder merges on green with proof" / "owner applies" / "owner sign-off to merge"
> mechanics are superseded.

## 1. SIDEBAR — FINAL ORDER (additive, owner-locked)
> **Count source of truth = `apps/frontend/src/components/layout/sidebar-config.ts` (`SIDEBAR_ITEM_IDS`),
> enforced by `scripts/verify-sidebar-contract.mjs`. Live count is **30** (render count is role-dependent;
> `eld` is a hidden stub). The historical list below is kept for record; the live array is
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
- Coverage data lives on **`insurance.policy`** (`coverage_type`, `coverage_type_id`, `total_premium_cents`)
  + **`insurance.policy_unit`** (`insured_value_cents`). *(Correction 2026-07-02: the once-planned
  `insurance.policy_unit_coverages` table was never built — no migration creates it and no code references
  it; the coverage model was folded onto policy/policy_unit during build. This was a STALE DOC reference,
  NOT prod migration-drift — GUARD verified prod has policy/policy_unit/coi_request, no coverages table.)*
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
6.4 verify-additive-only (sidebar) — fail if any id in locked 28-array is missing from SIDEBAR_ITEM_IDS.

## 6.5 LEGAL ↔ FINANCE OWNERSHIP (locked 2026-06-29 — Option B)
See `docs/specs/LEGAL-FINANCE-OWNERSHIP-AND-FLIP-READINESS.md` (canonical; supersedes the literal
Phase 5 of `CODER-BLOCK_Legal-Template-Library.md`).
- **Separation of duties:** the module that captures consent never posts the money. **Legal owns**
  template/lifecycle, executed instance + signed PDF, e-signature, the consent record, the audit
  trail, `legal.contract_instance_links` + handoff event, and the "signed-auth-on-file?" gate.
  **Finance owns** the engines: **FIN-22** = lease ASC 842 classification + schedule + lease GL;
  **FIN-18** = deduction math + settlement→GL. Legal builds NEITHER engine.
- **Flip-readiness gate (SUPERSEDED 2026-07-20 by owner decision — see §9.9):** posting-flag enablement is the
  OWNER's decision, not a CPA gate. Jorge ruled **"flags on … on all"** (2026-07-20, in chat): **ALL GL posting
  flags are ON for all three operating companies (TRANSP + TRK + USMCA)** — already live in prod. The engines
  (FIN-18 settlement, FIN-21 amortization, FIN-22 lease) remain REQUIRED (never orphaned); the prior
  "never flip until engine-built + CPA-confirmed" gate no longer holds — the owner has flipped them on.

## 7. QBO-PARITY UI SYSTEM (locked 2026-06-08)
See `docs/specs/qbo-parity/QBO_PARITY_UI_SYSTEM.md` (design law).
7.1 **Location dimension = driver/operator.** IH35 uses the QBO Location field to mean driver/operator; map Location→driver in TMS (CPA to confirm).
7.2 **CoA page must render the QBO-mirror, not the local-seed.** Root cause of "CoA showing wrong accounts" = dual datasets (page = ~50-row local seed; posting engine = ~199 QBO-mirror accounts via `/api/v1/mdata/accounts`). Repoint page/register/role-bindings at the QBO-mirror, RLS-scoped. **GATED — Task 0 data-source audit + Jorge OK before changing.** Do NOT disconnect QBO; bug is internal (dual datasets).
7.3 **Inline "+ Add new" is mandatory in every reference dropdown software-wide** (Category, Class, accounts, Payee, Vendor, Customer, Item, Terms, Payment method, Location). Opens an inline mini-create without closing the parent; returns with the new value selected. Account dropdowns KEEP the existing TMS lock-account control alongside.
7.4 **Sizing:** create/edit panels = bounded right drawers ~30% viewport (~576–582px); transaction editors (Expense/Bill/Check/Invoice/etc.) = full-page (the exception); match/reconcile summaries = sticky bottom bar.
7.5 **Every data table uses the shared QBO-parity table grammar** with density toggle (Regular/Compact/Ultra-compact) + configurable per-page. This is the fix for "TMS too wide/too large."

## 8. ACCOUNTING ARCHITECTURE — PARALLEL DOUBLE-BOOKS, CLONE-ONCE + RECONCILE-ONLY (locked 2026-07-02)
**This SUPERSEDES the old "QBO auto-sync + replay / lockstep" model in `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` §3.12.** Agents keep re-reading §3.12 and rebuilding a two-way sync — it is retired. The current architecture:

8.1 **Two independent systems, not a sync.** TMS and QuickBooks Online run in **parallel** (double books). **QBO is the system of record through 12/31/2025; TMS runs in parallel and is reconciled against it — TMS is NOT a mirror of QBO.** There is **NO bidirectional sync and NO write-back from TMS to QBO.** The old §3.12 "local-write-first then push to QBO, both stay in lockstep, replay on reconnect" is retired.

8.2 **Clone-once, then reconcile-only.** A one-time full backfill imports QBO data — **master data (customers/vendors) + AR (invoices/payments) + AP (bills/bill-payments) + GL** — into the TMS database (store-once). After backfill **both systems keep running in parallel and each INDEPENDENTLY registers the same daily activity** — the same bank transactions downloaded into both, the same expenses/bills created in both, the same payments applied in both. The twice-daily reconcile (the two Jorge-locked passes, `TMS-QBO-RECONCILIATION.md` §2) is a **CORRECTNESS TEST**: it confirms the same records/amounts exist in both books and flags anything in one but not the other — proving TMS registers every financial event correctly (a live QA harness against QBO), NOT a sync. Specs: `docs/specs/QBO-CLONE-PROGRAM.md` (master data + AR/AP clone, MD-1..MD-RECON), `docs/specs/TMS-QBO-RECONCILIATION.md`, and the QBO-IMPORT GL program (IMPORT-0..4v2).

8.3 **No write-back — target state; enforcement is PARTIAL today (stated honestly).** (a) JE path is **ENFORCED (merged):** `QBO_JE_PUSH_ENABLED` (default OFF, per-entity-only in `POSTING_FLAG_KEYS`) + a structural refusal of any `source_system != 'tms'` JE, consulted by BOTH push paths (immediate + the every-minute queue drain). See IMPORT-P0 / PR #1797 (`apps/backend/src/accounting/qbo-je-push-gate.ts`, guard `verify-qbo-push-gates.mjs`). (b) All **money-posting flags default OFF**, per-entity-only. (c) Entity paths are **NOT YET IN FORCE:** the six `T11.20.6.2` write-back handlers (customers/vendors/accounts/invoices/bills/items `tms.*.push_requested` → `push.service.ts`) are **default-ON via env var with no origin guard today** (latent — zero `tms.*.push_requested` rows exist yet). **IMPORT-P0b** adds `QBO_ENTITY_PUSH_ENABLED` (default OFF, per-entity-only) + clone-origin refusal on all six; until it merges, (c) is the intended state, not the current one.

8.4 **Both bases.** The canonical imported ledger is **accrual** detail (store-once). **Cash-basis is copied verbatim from QBO's own cash reports** — QBO computes it; TMS never re-derives cash during the QBO-SoR window. A native TMS cash-conversion engine is a **post-12/31/2025-cutover** block, not now.

8.5 **Conversion + entities.** Convert **01/01/2024** for TRANSP + TRK; opening position = **Balance Sheet as of 12/31/2023 → Opening Balance Equity** (OBE is a *temporary clearing* account, expected ≈ 0; a permanent OBE balance is a defect — plan OBE→Retained-Earnings reclass). **USMCA has no QuickBooks** → it is **TMS-authoritative from day one** (2026), never part of the clone/reconcile. Two QBO realms: TRANSP `123145885549599`, TRK `1432746210`; assert realm↔opco on the unrevoked connection only.

8.6 **Factoring = secured borrowing (recourse), not a sale.** (Faro today → RTS planned.) See `[[cpa-locked-decisions-2026-07-01]]` + `[[driver-escrow-is-liability]]`.

8.7 **Cutover — EVENT-gated, not date-gated.** Authority flips at the **cutover ceremony** (final clone + to-the-cent tieout proving the books agree + book-lock), NOT on a calendar date. **12/31/2025 was the target and has already passed — we remain parallel until the ceremony completes; no agent may treat the date as permission to flip a push flag.** At cutover TMS becomes authoritative; period-lock + a final court/CPA-grade tieout snapshot. Nothing locks/closes during the reconciliation window.
8.8 **Owner decisions LOCKED 2026-07-02** (details in `docs/specs/ACCOUNTING-ARCHITECTURE.md` "Locked owner decisions"): (1) factoring_advance push GATED OFF (folded into the JE kill-switch); (2) all push flags OFF for all entities, EVENT-gated; (3) driver→QBO vendor = no synchronous create, reconcile links it; (4) FIN-2 approved; (5) retire the sync counter; (6) required-doc regulatory defaults, warn-first; (7) canonical Faro vendor `3585f27e`; (8) BS-only opening + a mandatory RE-roll tieout test in IMPORT-4v2. Reconcile: AM bank pass reads QBO's real register (not the sync queue) + row-level match.

8.9 **⚑ Ch.11 FRESH-START — opening-balance anchor + parallel live-posting start (OWNER-FINAL 2026-07-16; SUPERSEDES the prior 07/01/2026 cutover / 06/30/2026 opening lock).** Chapter 11 was approved end of March 2026 → the books change in April, so **03/31/2026 is the fresh-start line**: **opening balances = QBO Balance Sheet as of 03/31/2026, per entity** (re-syncable until the owner locks — the accountant's embezzlement cleanup keeps re-syncing into provisional balances), and **TMS posts live in parallel + reconciles daily vs QBO from 04/01/2026** (per entity, only after that entity's opening balance is imported + tied). This moves **Apr/May/Jun 2026 from "mirror QBO" to LIVE TMS posting** (3 more live months than the old 07/01 line) — expected. This is the **internal GL-posting** go-live date; it does **not** change §8.7 — the **QBO-PUSH authority cutover (TMS-becomes-SoR) stays EVENT-gated** (ceremony + to-the-cent tieout), and the historical QBO clone conversion (§8.5, `01/01/2024`) is unchanged. Canonical spec: `docs/specs/OPENING-BALANCE-IMPORT-AND-CUTOVER-2026-07-16.md`.

**Canonical cross-refs:** `docs/specs/TMS-QBO-RECONCILIATION.md`, `docs/specs/QBO-CLONE-PROGRAM.md`, the QBO-IMPORT program blocks, and auto-memory `qbo-import-design-corrections` + `cpa-locked-decisions-2026-07-01`.

---

## 9. Driver-pay / deduction / escrow engine — LOCKED 2026-07-04 (audit-fix decisions B–I)
Locked by the owner while triaging the shared 130-finding audit. Source of truth: auto-memory `[[audit-fix-decisions-2026-07-04]]`, Desktop `IH35-TMS-BUG-FIX-OWNER-DECISIONS.md`, tracker `docs/trackers/BUG-AUDIT-FIX-TRACKER.md`. All financial items build behind OFF flags on a Neon test branch → owner OK + CPA-verify in staging → only then flip a prod flag; coder merges on green with proof.

> **SUPERSESSION NOTE (2026-08-03):** the merge/flag-flip mechanics in the line above ("coder merges on green with proof," "owner OK... only then flip") predate **OWNER LAW (FINAL, 2026-08-03)**: NO HOLDS, NO owner-approval merge label — every coder has FULL Neon access and merges on green in every lane, and flips a flag itself once the owner has decided (in chat) to turn it on. The underlying decisions above (net-pay floor, recovery ordering, escrow liability treatment, etc.) are unchanged and still locked; only the merge/flip *mechanism* is superseded. See `.cursor/rules/00-operating-method-LAW.mdc` (governance section).

9.1 **Canonical deduction store = `driver_finance.driver_settlement_deductions`** (the FIN-18 poster already reads it). The live settlement route must write deductions here and stamp `applied_to_settlement_id` (today it writes `settlement_lines` auto_deduction, which the poster never reads → drivers silently overpaid). Retire the `payroll.*` copy + the `settlement_lines` auto_deduction path.

9.2 **Net-pay floor = 5% DEFAULT, EDITABLE per settlement.** Corrects the earlier "10%" record. Driver keeps ≥5% of gross by default; the settlement UI shows an **Accept / Edit-amount** control so the operator can adjust the deducted amount, and on termination/leaving may override the floor and deduct up to the **full final check** (owes $2,000, final check $1,500 → deduct all $1,500). One floor resolver, one config source, default 5%, overridable.

9.3 **Recovery ordering = PAY FIRST, then escrow.** Walkoff/abandonment/damage recoveries deduct from the driver's **settlement pay first**, and only draw from **escrow for any shortfall**. Escrow is a last-resort buffer that must keep GROWING — a fine (overweight, etc.) can arrive 30–45 days AFTER a driver leaves and escrow must still cover it. Migration 0094's auto-escrow-on-walkoff trigger must be reworked to hit pay first, escrow only if pay is insufficient, and fire a **single** charge per event (kills the current double-charge where the app chargeback AND the escrow trigger both fire).

9.4 **Escrow return = 60–90 day return-on-separation, net of open claims.** Every escrow draw debits the **Driver Escrow liability** (QBO-1150040187), never an expense — see `[[driver-escrow-is-liability]]`.

9.5 **Deduction authorization = the signed HIRE CONTRACT — no separate driver e-sign.** The `CONSENT_MISSING` gate (finding G11-1) is satisfied by the hire contract, not a driver-facing e-sign template. The hire-contract template is built later in the **Legal module** and carries the payroll-deduction authorization for new drivers. (Simplifies the former "Repair B / consent template" build.)

9.6 **Schema canonicals:** `finance.loans` kept as a documented §4 exception (no rename); `reporting.*` canonical for scheduled reports (migrate `reports.*` rows in, archive the old); `mdata.qbo_*` canonical for the QBO mirror (repoint the `accounting.qbo_*` writers); `mdata.vendors` canonical for vendors (+ a resolver so WO/expense pickers read it).

9.7 **Everything links to the load.** Create Bill gains line items + `load_id`; universal rule — diesel, expenses, repairs, on-trip maintenance, truck, trailer, driver all connect to the load/driver. See `[[cross-module-linkage-rule]]`.

9.8 **Never delete — ARCHIVE only.** Everything stays findable in the log + audits (§7 additive-only).
    Fixture carve-out (OWNER RULING 2026-07-25): verified test/demo **rows** may be permanently DELETED under owner authorisation, scoped by an EXACT business identifier — never by `is_sample_data`, which is false on 176 real rows and true on 17 fixtures (banned + CI-enforced by verify-step 1488). Modules, surfaces, routes, columns and tables are NOT covered and stay archive-only.

9.9 **GL posting flags — ALL ON, owner-decided 2026-07-20.** Jorge ruled in chat **"flags on … on all"** / **"it's my decision"** (posting-flag enablement is the OWNER's call, not a CPA gate). **ALL GL posting flags are ON for all three operating companies (TRANSP + TRK + USMCA)** — `AMORTIZATION`, `BANK_FEED`, `BANK_TX_SPLIT`, `BILL`, `BILL_PAYMENT`, `CUSTOMER_PAYMENT`, `DRIVER_ADVANCE`, `EXPENSE`, `FACTORING`, `GL_POSTING_ENABLED`, `INVOICE_AR`, `LEASE`, `PROPERTY_TAX`, `SETTLEMENT`, `TRANSFER`. This supersedes the 2026-07-04 "SETTLEMENT + LEASE OFF until CPA" line and the flip-readiness gate above. **Verified live on Neon `br-fancy-credit-akjnd07a` (2026-07-20):** all three entities carry `lib.feature_flag_overrides` rows `=true` for every posting flag listed. Do NOT flip any of these OFF without a new owner line. Flag-key defaults remain OFF (per-entity overrides drive the ON state).

## 10. ACCOUNTING SUB-NAV = APPROVED GROUPED CLICK-OPEN DROPDOWNS (locked — supersedes flat clean-tabs)
- The Accounting module top-bar sub-nav is the **APPROVED grouped click-open dropdown** row per
  `docs/approved-screens/3-Accounting-Dropdown.png`. Top nodes, in order:
  **Accounting · Bills ▾ · Expenses ▾ · Bill payment ▾ · Maintenance & shop ▾ · Vendors · Customers · Reports**,
  plus an overflow **More ▾** for back-office / AR / factoring / catalog / settings routes the PNG does not
  surface as top nodes (so **every** routed accounting page is reachable by a click — many were URL-only).
- **Bills ▾** = Bill · Maintenance bill · Repair bill · Fuel bill · Driver bill · Vendor bill · Multiple bills
  (+ Recurring bills, additive). Labels follow the PNG where PNG label ≠ data label.
- Groups **open on CLICK and stay open** until an item is chosen / outside-click / Escape — **NOT hover**
  (Jorge directive 2026-06-09, `docs/specs/NAVIGATION-PATTERN-RULE.md`). Rendered via the shared
  `HoverDropdownNav` (`openOn="click"`) from `ACCOUNTING_SUB_NAV_ITEMS` in
  `apps/frontend/src/pages/accounting/subnav-manifest.ts`.
- **This SUPERSEDES the flat `ACCOUNTING_CLEAN_TABS` render** (undocumented nav-unification #1552 drift).
  Per §7/§9 the approved screen wins over undocumented drift. `ACCOUNTING_CLEAN_TABS`/`ACCOUNTING_MORE_TABS`
  are retained as exports only for legacy CI guards; they are no longer rendered.
- TOP-BAR ONLY — never a left rail (CLAUDE.md §7; `scripts/verify-accounting-nav.mjs` Check 7 keeps
  `QboAccountingSubNav.tsx` absent). Enforced by `scripts/verify-accounting-subnav-grouped.mjs`
  (asserts grouped click-open render + approved top-group set; flat clean-tabs cannot silently return).
- Vocab stays locked: **`+ Create`** (kept as `+ Create ▾`), never `+ Add`/`+ New`.
