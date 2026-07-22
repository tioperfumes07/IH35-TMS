# FULL REPO / DEPLOY LINKAGE AUDIT — Law of the Land §9

**Deployed:** `https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (as of audit start 2026-07-21)  
**Standard:** Every money/ops event must appear in **every** module/tab/GL/JE/expense/bill/payment/driver/unit/claim/legal surface it belongs in — **forward + reverse**. “Merged” ≠ done.

**Method:** Audit by **economic path** (not pile STALE). Each path → PASS / FAIL / UNVERIFIED with evidence. Every FAIL → code fix PR. Coder merges + Neon; Cursor builds.

## Deploy vs main

| Ref | SHA | Note |
|---|---|---|
| Live API | `e64fc4c` | healthz shallow |

## Neon truth snapshot (RLS bypass `lucia`, prod `br-fancy-credit-akjnd07a`, 2026-07-21)

| Metric | Count |
|---|---|
| `accounting.bills` | 16196 |
| `accounting.bill_lines` | **0** |
| `accounting.bill_payments` | **0** |
| `accounting.expenses` / `expense_lines` | **0** / **0** |
| `accounting.invoices` / `invoice_lines` | 1 / 1 |
| `accounting.journal_entries` | 7 |
| `banking.bank_transactions` | 10427 (10424 `pending_categorization`, 3 categorized) |
| bank matched expense/bill/invoice | **0** / **0** / **0** (3 matched JE) |
| `fuel.fuel_transactions` | 1499 (unit 1367; driver **0**; load **0**; qbo_expense **0**) |
| `insurance.claim` / `lawsuit` / `legal.matters` | **0** / **0** / **0** |
| `maintenance.work_orders` | 2 (vendor **0**) |
| `driver_finance.driver_settlements` / advances / escrow_ledger | **0** / **0** / **0** |
| `accounting.factoring_advances` / `factoring.batch` | **0** / **0** |
| `catalogs.account_role_bindings` | **0** |
| `safety.civil_fines` / `internal_fines` / `incidents` | **0** / **0** / **0** |
## Path register (master)

| Path ID | Economic event | Audit PR / file | Overall | Top FAILs | Fix PRs |
|---|---|---|---|---|---|
| P-EXPENSE | Expense → GL/JE → list/register/vendor/payment | #3166 · `LAW-E2E-EXPENSE-LINKAGE-2026-07-21.md` | **FAIL** | reverse drill | #3170 |
| P-BILL | Vendor bill → bill_lines → AP → payment → JE | #3167 · `LAW-E2E-BILL-BILLPAYMENT-LINKAGE-2026-07-21.md` | **FAIL** | 0 bill_lines on Neon | #3172 |
| P-SETTLE | Settlement → pay-run → CoA → JE → escrow | #3168 · `LAW-E2E-SETTLEMENT-…` | **FAIL** | no FE; CoA undesignated; main resolver | #3149 #3171 |
| P-CLAIM-LEGAL | Claim → legal → expense → driver/unit → GL → pay | #3175 | **FAIL** | no expense/bill FK; no deductible; claim/legal UI pickers | *(UI fix in flight; HOLD mig later)* |
| P-INVOICE | Load → invoice → AR → payment → JE | **this PR** · `LAW-E2E-INVOICE-AR-LINKAGE-2026-07-21.md` | **FAIL** | 1 fixture invoice; load null; JE reversed; payments=0; no JE EntityLink | TBD |
| P-FACTOR | Factoring advance → liability/reserve → JE | **this PR** · `LAW-E2E-FACTORING-LINKAGE-2026-07-21.md` | **FAIL** | 0 batches/advances/lifecycle JE despite flag ON | TBD |
| P-FUEL | Fuel txn → expense/GL → unit/driver → JE | **this PR** · `LAW-E2E-FUEL-LINKAGE-2026-07-21.md` | **FAIL** | 1499 txns; posted_to_gl=0; driver/vendor/load=0; 0 fuel_event JE | TBD |
| P-MAINT | WO → bill/expense → unit → JE | *(batch3)* | **FAIL*** | 2 WOs; 0 vendor; bill_lines=0 | TBD |
| P-SAFETY | Incident/fine → liability/expense → driver → JE | *(batch3)* | **UNVERIFIED*** | 0 fines/incidents live; schema TBD in audit PR | TBD |
| P-BANK | Bank txn → match/categorize → GL → source entity | **this PR** · `LAW-E2E-BANK-MATCH-LINKAGE-2026-07-21.md` | **FAIL** | 10424/10427 for_review; 0 invoice/bill match; register/JE reverse gaps | TBD |
| P-ESCROW | Escrow contribution/release → liability → driver | *(batch3)* | **FAIL*** | escrow_ledger=0 | TBD |
| P-ADVANCE | Cash advance → recovery → settlement → JE | *(batch3)* | **FAIL*** | advances=0; settlements=0 | TBD |

\* Preliminary Neon verdict pending full hop-table audit PR from batch agents; will not be marked PASS without hop evidence.
## Non-path merged volume (context)

GitHub reports **≥500** merged PRs since 2026-07-10 alone (API page cap). Re-auditing by PR title is how STALE theater failed. **We audit paths + live Neon/UI**, then map merged PRs into paths as evidence — not the reverse.

## Rules for this ledger

1. No “STALE / already on main” as PASS without hop evidence.  
2. LIVE PROOF required for PASS (Neon RLS-bypass + browser or endpoint). Else **UNVERIFIED**.  
3. Fix PRs must include ACCEPTANCE + §9 LINKAGE.  
4. Cursor does not merge.

## Update log

| Date | Change |
|---|---|
| 2026-07-21 | Ledger opened; P-EXPENSE/BILL/SETTLE FAIL documented; claim-legal audit dispatched |
| 2026-07-21 | Neon snapshot + P-CLAIM-LEGAL FAIL; bank/fuel/factor/invoice preliminary FAIL from counts |
| 2026-07-21 | P-CLAIM-LEGAL → #3175 FAIL; closed duplicate #3174; #3172 CI repair in flight |
| 2026-07-21 | Batch2: P-INVOICE / P-FACTOR / P-FUEL / P-BANK FAIL-honest audits + ranked P0s (deploy `e64fc4c`) |