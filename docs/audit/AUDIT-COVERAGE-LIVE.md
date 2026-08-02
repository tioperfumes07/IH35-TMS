# AUDIT COVERAGE — LIVE (single source of truth)

**This file is the work list.** Before ANY block, read it. Your work list = the rows where
`Verdict = FAIL` **and** `Status = OPEN` **and** the lane is yours.

Established 2026-08-02 · **APPEND-ONLY** · one file, many writers.

---

## Column ownership — never edit another role's column

| Role | Owns | Write mode |
|---|---|---|
| **CASCADE** | `Module` · `Layer` · `Entity` · `Verdict` · `Evidence` · `Date` · `Auditor` | **APPENDS new rows only** |
| **CODER / CURSOR** | `Status` · `Block/PR` | only on rows **in their lane**; only `FIXED (PR #nnnn)` |
| **GUARD** | `Status` → `VERIFIED` / `REOPENED` | **only GUARD writes `VERIFIED`** |

**Rules of the file**
1. **Sync first.** `git pull --ff-only origin main` before you write — the row you edit must be current.
2. **Commit + push immediately** after writing. Small atomic docs-only commit. Non-financial → self-merge on green CI.
3. **NEVER delete a row.** Supersede = append a new dated row and mark the old one `SUPERSEDED`.
4. **A row with no `Evidence` is not a finding — it does not count.** Evidence means live proof produced
   this session: a prod read with its positive control, a file:line, an endpoint response, a health SHA.
5. **`Owner-gate?`** = `YES` when the row cannot be closed by a coder because it needs an owner DECISION
   (canonical pick, account designation, legal call, opening balance). Coders do not self-answer these.
6. **Report TRANSP and USMCA separately.** Every verdict is TRANSP-only unless the `Entity` cell says otherwise.

**Layers:** `A` chrome/parity · `B` module close (confirmed FAIL / UNVERIFIED) · `C` deep linkage + GL ·
`D` picker law · `E` UI/design. No module is a certified PASS until all five pass independently, with live evidence.

**Read discipline (doc 06):** a `0`/empty is not proof. Every count below was read on Neon prod branch
`br-fancy-credit-akjnd07a` with `app.bypass_rls='lucia'` and a **positive control** (`mdata.vendors = 2,827`,
matching `n_live_tup`) proving the zeros are real and not RLS-masked.

---

## Scoreboard

| Metric | Value | As of |
|---|---|---|
| Modules certified full-PASS (all 5 layers) | **0 / 30** | 2026-08-02 |
| Modules with a confirmed live defect | **15 / 30** | 2026-08-02 |
| Rows in this file | **8** | 2026-08-02 |
| Rows `FAIL` + `OPEN` | **6** | 2026-08-02 |
| Rows `Owner-gate? = YES` (blocked on a decision) | **3** | 2026-08-02 |
| Rows `VERIFIED` by GUARD | **0** | 2026-08-02 |

Deployed SHA at establishment: `45f7c28047` (== `origin/main`, `/api/v1/healthz/shallow` → `45f7c28`).

---

## Findings

| # | Module | Layer | Entity | Verdict | Evidence | Status | Block/PR | Owner-gate? | Date | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Fuel | B | TRANSP | FAIL | `fuel.fuel_transactions`: **1,547 of 1,547** rows have `load_id IS NULL` (100%). Every diesel/roadside expense must FK to a load (G18). Prod read w/ positive control `mdata.vendors=2,827`. Matches doc 05 CLS-LINKAGE-ONEWAY. | OPEN | — | NO | 2026-08-02 | CLAUDE-CODER |
| 2 | Banking | E | TRANSP | FAIL | All-accounts aggregate: the UI total does not reconcile to the per-account sum. Live base verified — `banking.bank_transactions` = **10,961** = TRANSP 5,968 + TRK 4,835 + USMCA 158 (parts sum to `n_live_tup` → complete); `banking.bank_accounts` = 16; `categorized_at NOT NULL` = 170, NULL = 10,791. **The "must equal 1,255" figure is UNVERIFIED — no live query reproduced 1,255; Cascade to supply the exact surface + filter that produces it.** | OPEN | — | NO | 2026-08-02 | CLAUDE-CODER |
| 3 | Bills / Accounting | C | TRANSP+TRK | FAIL | `accounting.bills.mdata_vendor_id IS NULL` = **2 of 16,246** (0.01%). Bills reach A/P but 2 cannot reach the canonical vendor hub. | OPEN | — | NO | 2026-08-02 | CLAUDE-CODER |
| 4 | Bills / Accounting | C | TRANSP+TRK | SUPERSEDED | Prior record "`mdata_vendor_id` NULL on **16,246** bills" (memory `owner-data-gaps-blocking-modules-2026-08-01`). Superseded by row 3: migration `202611090000_backfill_bills_mdata_vendor_id.sql` is applied on prod (ledger max `202611130000`), leaving 2. | SUPERSEDED | — | NO | 2026-08-02 | CLAUDE-CODER |
| 5 | Accounting / Settlements | C | TRANSP | FAIL | `damage_recovery` role → `QBO-1150040091 "Driver Accident Damages & Repairs"` = **OtherExpense**, active. `settlement-posting.service.ts:310-330` posts `{type}_recovery` as a **CREDIT**, so a damage deduction credits a P&L cost account instead of relieving a driver receivable. Blueprint §3.13.3.5 requires `DR Driver Receivable / CR Accident Damage Recovery (income)`. Contrast the correct sibling: `advance_recovery` → "Driver Cash Advance" (**Asset**). No bleed yet: `driver_finance.driver_liabilities` `n_tup_ins=0`, 0 postings to the account. | OPEN | — | **YES** — account designation is an owner decision (doc 02 §1, doc 03 §3) | 2026-08-02 | CLAUDE-CODER |
| 6 | Accounting / Settlements | C | USMCA | FAIL | Same class as row 5, worse target: `damage_recovery` → `5400 "Truck Repairs & Maintenance"` = **CostOfGoodsSold**, active — a driver recovery would contaminate real repair COGS. The purpose-built `DRIVERRECOVE488409 "Driver-Recovery-Damage"` (**Income**) exists but is **inactive**. | OPEN | — | **YES** — same designation decision | 2026-08-02 | CLAUDE-CODER |
| 7 | Accounting / Settlements | C | TRK | FAIL | Same class: TRK's only `damage_recovery` binding (`QBO-1150040187 "Damage Claim Escrow"`, Liability) is **inactive** → no active binding → resolver returns null → poster throws `ACCOUNT_ROLE_BINDING_MISSING`. Any TRK settlement carrying a damage deduction **cannot post at all**. Fails closed — the honest failure of the three. | OPEN | — | **YES** — same designation decision | 2026-08-02 | CLAUDE-CODER |
| 8 | QBO Sync | C | TRANSP | PASS | `qbo_sync.step.vendors_pull` writes canonical `mdata.qbo_vendors` (`vendors-puller.ts:53`). `_system.background_jobs.last_successful_run_at` = **2026-08-02 08:00 CT** — first success in the system's life; prior error was `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Fix SHA `1084534ad8` proven ancestor of deployed `45f7c28047`. Residual (separate row when Cascade opens it): 2,782 RETIRE `accounting.qbo_vendors` rows still unreconciled vs 2,783 canonical. | FIXED (PR #3993) | #3993 | NO | 2026-08-02 | CLAUDE-CODER |
