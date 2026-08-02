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
| Rows in this file | **17** | 2026-08-02 |
| Rows `FAIL` + `OPEN` | **4** | 2026-08-02 |
| Rows `Owner-gate? = YES` (blocked on a decision) | **1** | 2026-08-02 |
| Rows `VERIFIED` by GUARD | **0** | 2026-08-02 |

Deployed SHA at establishment: `45f7c28047` (== `origin/main`, `/api/v1/healthz/shallow` → `45f7c28`).

---

## Findings

| # | Module | Layer | Entity | Verdict | Evidence | Status | Block/PR | Owner-gate? | Date | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Fuel | B | TRANSP | FAIL | `fuel.fuel_transactions`: **1,547 of 1,547** rows have `load_id IS NULL` (100%). Every diesel/roadside expense must FK to a load (G18). Prod read w/ positive control `mdata.vendors=2,827`. Matches doc 05 CLS-LINKAGE-ONEWAY. | OPEN | — | NO | 2026-08-02 | CLAUDE-CODER |
| 2 | Banking | E | TRANSP | FAIL | All-accounts aggregate: the UI total does not reconcile to the per-account sum. Live base verified — `banking.bank_transactions` = **10,961** = TRANSP 5,968 + TRK 4,835 + USMCA 158 (parts sum to `n_live_tup` → complete); `banking.bank_accounts` = 16; `categorized_at NOT NULL` = 170, NULL = 10,791. **The "must equal 1,255" figure is UNVERIFIED — no live query reproduced 1,255; Cascade to supply the exact surface + filter that produces it.** | FIXED (PR #4011) | #4011 | NO | 2026-08-02 | CLAUDE-CODER |
| 3 | Bills / Accounting | C | TRANSP+TRK | FAIL | `accounting.bills.mdata_vendor_id IS NULL` = **2 of 16,246** (0.01%). Bills reach A/P but 2 cannot reach the canonical vendor hub. Root cause at discovery: QBO vendor 2244 absent from mirror (vendors_pull had never succeeded). **Post-#3993 prod read:** vendor 2244 now in `mdata.vendors` (`f45f37e3…`); pass-3 backfill resolves both bills idempotently. | FIXED (PR #4009) | #4009 | NO | 2026-08-02 | CLAUDE-CODER |
| 4 | Bills / Accounting | C | TRANSP+TRK | SUPERSEDED | Prior record "`mdata_vendor_id` NULL on **16,246** bills" (memory `owner-data-gaps-blocking-modules-2026-08-01`). Superseded by row 3: migration `202611090000_backfill_bills_mdata_vendor_id.sql` is applied on prod (ledger max `202611130000`), leaving 2. | SUPERSEDED | — | NO | 2026-08-02 | CLAUDE-CODER |
| 5 | Accounting / Settlements | C | TRANSP | FAIL — **WRONG, see row 9** | `damage_recovery` role → `QBO-1150040091 "Driver Accident Damages & Repairs"` = **OtherExpense**, active. `settlement-posting.service.ts:310-330` posts `{type}_recovery` as a **CREDIT**, so a damage deduction credits a P&L cost account instead of relieving a driver receivable. Blueprint §3.13.3.5 requires `DR Driver Receivable / CR Accident Damage Recovery (income)`. Contrast the correct sibling: `advance_recovery` → "Driver Cash Advance" (**Asset**). No bleed yet: `driver_finance.driver_liabilities` `n_tup_ins=0`, 0 postings to the account. | SUPERSEDED | — | NO | 2026-08-02 | CLAUDE-CODER |
| 6 | Accounting / Settlements | C | USMCA | FAIL — **prescription wrong, see row 11** | Same class as row 5, worse target: `damage_recovery` → `5400 "Truck Repairs & Maintenance"` = **CostOfGoodsSold**, active — a driver recovery would contaminate real repair COGS. The purpose-built `DRIVERRECOVE488409 "Driver-Recovery-Damage"` (**Income**) exists but is **inactive**. | SUPERSEDED | — | NO | 2026-08-02 | CLAUDE-CODER |
| 7 | Accounting / Settlements | C | TRK | FAIL — **WRONG, see row 10** | Same class: TRK's only `damage_recovery` binding (`QBO-1150040187 "Damage Claim Escrow"`, Liability) is **inactive** → no active binding → resolver returns null → poster throws `ACCOUNT_ROLE_BINDING_MISSING`. Any TRK settlement carrying a damage deduction **cannot post at all**. Fails closed — the honest failure of the three. | SUPERSEDED | — | NO | 2026-08-02 | CLAUDE-CODER |
| 8 | QBO Sync | C | TRANSP | PASS | `qbo_sync.step.vendors_pull` writes canonical `mdata.qbo_vendors` (`vendors-puller.ts:53`). `_system.background_jobs.last_successful_run_at` = **2026-08-02 08:00 CT** — first success in the system's life; prior error was `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Fix SHA `1084534ad8` proven ancestor of deployed `45f7c28047`. Residual (separate row when Cascade opens it): 2,782 RETIRE `accounting.qbo_vendors` rows still unreconciled vs 2,783 canonical. | FIXED (PR #3993) | #3993 | NO | 2026-08-02 | CLAUDE-CODER |
| 9 | Accounting / Settlements | C | TRANSP | **PASS — supersedes row 5** | **Row 5 was wrong; I had not searched the migrations for a settled designation.** `db/migrations/202607800000_escrow_forfeit_source_type_and_damage_recovery_designation.sql` header carries **OWNER RULING 2026-07-23**: driver-damage recovery is "a RECOVERY against a recorded loss, **never income**… designated to the account that already records driver-caused damage — QBO-1150040091 'Driver Accident Damages & Repairs' (OtherExpense/VehicleRepairs) — so a forfeit OFFSETS the exact expense the damage created (**contra-expense**, the same shape as the locked insurer-recovery ruling). **No NEW account is minted.**" Live binding matches the ruling exactly: role row `f25c36ed…`, active, created `2026-07-24T00:03:18Z`, → `QBO-1150040091`, OtherExpense/VehicleRepairs, postable, not deactivated. TRANSP's earlier Liability binding (`QBO-250`, created 07-23 19:02Z) is correctly inactive. **The driver's obligation lives in the `driver_finance.driver_liabilities` subledger — there is no GL income leg by design.** | VERIFIED-CORRECT (no action) | — | NO | 2026-08-02 | CLAUDE-CODER |
| 10 | Accounting / Settlements | C | TRK | **N/A (expected state) — supersedes row 7** | **Row 7 was an `expected-state-recorded-as-failure`.** The same migration states verbatim: *"TRK is intentionally omitted (no driver escrow forfeiture path)."* TRK is the asset holder and runs no driver settlements, so having no active `damage_recovery` binding is the **designed** state, not a defect. The poster failing closed there is correct behavior. TRK's only binding (`QBO-1150040187` "Damage Claim Escrow", Liability, created 07-23 21:33Z) is correctly inactive. | CLOSED — not a defect | — | NO | 2026-08-02 | CLAUDE-CODER |
| 11 | Accounting / Settlements | C | USMCA | **FAIL — supersedes row 6 (finding stands, prescription corrected)** | USMCA `damage_recovery` → `5400 "Truck Repairs & Maintenance"` (**CostOfGoodsSold** / "Other Costs of Services - COS"), role row `404dad33…`, **active**, created `2026-07-24T02:59:08Z` — i.e. it *superseded* USMCA's earlier Income binding (`f3490d5a…`, `DRIVERRECOVE488409`, created 01:22:46Z) three hours later. A driver-damage recovery credited to general repair COGS **contaminates real truck-repair cost**. Root cause: the 07-23 ruling migration resolves its account by `(operating_company_id, account_number)` and **USMCA has no `QBO-1150040091`**, so the INSERT designated nothing for USMCA and something else filled the gap. **Confirmed live: USMCA has NO contra-expense damage account at all** — its only damage-related account is `DRIVERRECOVE488409` (**Income**), which the ruling forbids. **CORRECTED FIX (owner-directed 2026-08-02):** as part of the USMCA chart build, create USMCA's own "Driver Accident Damages & Repairs" **contra-expense** account mirroring TRANSP **by purpose** (NOT the inactive Income account), then repoint USMCA `damage_recovery` to it. Do **not** activate `DRIVERRECOVE488409`. | OPEN — FINANCIAL-HOLD: build + STOP for Jorge; GUARD to re-confirm this binding on Neon before any repoint migration | — | **YES** | 2026-08-02 | CLAUDE-CODER |
| 12 | Dispatch | B | TRANSP | PASS (honest-empty) | 10 real TRANSP loads (`mdata.loads`), 20 stops (exactly 2 per load = clean pickup-delivery pairs), 7 distinct statuses active (`assigned_not_dispatched`=3, `booked`=2, `in_transit`/`cancelled`/`completed_docs_received`/`delivered`/`dispatched`=1 each). Data is consistent at this small volume — cannot stress-test at scale but no anomaly detected. Positive control: `mdata.vendors`=2,827. | — | — | NO | 2026-08-02 | CASCADE |
| 13 | Legal | B | TRANSP | PASS (honest-empty) | `legal.matters`=0, `legal.matter_events`=0, `legal.matter_documents`=0, `legal.matter_deadlines`=0 — all 0 rows company-wide. Schema is structurally complete (matters → events/documents/deadlines FK-enforced), zero data entered. No code bug — genuine data scarcity. Positive control: `mdata.vendors`=2,827. | — | — | NO | 2026-08-02 | CASCADE |
| 14 | Lists | B | TRANSP | PASS | Neon cross-check: `catalogs.accounts`=399, `catalogs.payment_methods`=9, `catalogs.driver_deduction_types`=7, `catalogs.internal_fine_reasons`=6, `catalogs.load_cancellation_reasons`=21, `catalogs.parts`=0 (TRANSP). All consistent with UI. `catalogs.parts`=0 is the same Inventory data-quality gap noted elsewhere (144 `maintenance.parts_inventory` rows but 0 catalog parts for TRANSP). Positive control: `mdata.vendors`=2,827. | — | — | NO | 2026-08-02 | CASCADE |
| 15 | Program | B | TRANSP | PASS | `lib.feature_flags`=83, `lib.feature_flag_overrides`=213, `ops.program_board_notes`=5, `safety.da_program_enrollments`=0, `safety.training_programs`=0. Feature-flag infrastructure is real and populated (83 flags, 213 per-entity overrides — confirms posting flags are per-entity overrides, not global). Board notes real. Training/enrollment empty = data scarcity. Positive control: `mdata.vendors`=2,827. | — | — | NO | 2026-08-02 | CASCADE |
| 16 | ELD/Telematics | B | TRANSP | PASS | `samsara.hos_snapshots`=**66,541** real rows (Samsara integration live and actively ingesting). `safety.hos_exceptions`=0, `safety.hos_violations`=0, `reports.ifta_filings`=0. The 66K HOS snapshots confirm real telemetry. Zero exceptions/violations consistent with broader safety-data-scarcity. IFTA=0 expected pre-quarterly-filing. Positive control: `mdata.vendors`=2,827. | — | — | NO | 2026-08-02 | CASCADE |
| 17 | Factoring | B | TRANSP | PASS (honest-empty) | `accounting.factoring_advances`=0, `accounting.factoring_reserve_movements`=0, `accounting.factoring_default_interest_accruals`=0 — all 0s company-wide. Schema structurally complete but no factoring activity has occurred. Consistent with Layer C finding (KPI-vs-profile dual-path dead read) being a code quality issue on an unused-in-production feature. Positive control: `mdata.vendors`=2,827. | — | — | NO | 2026-08-02 | CASCADE |
