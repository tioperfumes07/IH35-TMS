# FULL REPO / DEPLOY LINKAGE AUDIT — Law of the Land §9

**Deployed:** `https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (as of audit start 2026-07-21)  
**Standard:** Every money/ops event must appear in **every** module/tab/GL/JE/expense/bill/payment/driver/unit/claim/legal surface it belongs in — **forward + reverse**. “Merged” ≠ done.

**Method:** Audit by **economic path** (not pile STALE). Each path → PASS / FAIL / UNVERIFIED with evidence. Every FAIL → code fix PR. Coder merges + Neon; Cursor builds.

## Deploy vs main

| Ref | SHA | Note |
|---|---|---|
| Live API | `e64fc4c` | healthz shallow |
| `origin/main` | `e64fc4c` | matched at ledger refresh |

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
| P-EXPENSE | Expense → GL/JE → list/register/vendor/payment | #3166 | **FAIL** | reverse drill | #3170 |
| P-BILL | Vendor bill → bill_lines → AP → payment → JE | #3167 | **FAIL** | 0 bill_lines on Neon | #3172 |
| P-SETTLE | Settlement → pay-run → CoA → JE → escrow | #3168 | **FAIL** | no FE; CoA undesignated; main resolver | #3149 #3171 |
| P-CLAIM-LEGAL | Claim → legal → expense → driver/unit → GL → pay | #3175 | **FAIL** | no expense/bill FK; no deductible; claim/legal UI pickers | *(UI fix in flight; HOLD mig later)* | *(this wave)* | **FAIL** | no expenses.claim_id; no deductible; no recovery FK | *(HOLD mig after audit PR)* |
| P-INVOICE | Load → invoice → AR → payment → JE | *(batch2 in flight)* | **FAIL*** | 1 invoice only; AR/payment chain thin | TBD |
| P-FACTOR | Factoring advance → liability/reserve → JE | *(batch2)* | **FAIL*** | 0 advances / 0 batches live | TBD |
| P-FUEL | Fuel txn → expense/GL → unit/driver → JE | *(batch2)* | **FAIL*** | 1499 txns; 0 driver/load/qbo_expense | TBD |
| P-MAINT | WO → bill/expense → unit → JE | *(batch3)* | **FAIL*** | 2 WOs; 0 vendor; bill_lines=0 | TBD |
| P-SAFETY | Incident/fine → liability/expense → driver → JE | *(batch3)* | **UNVERIFIED*** | 0 fines/incidents live; schema TBD in audit PR | TBD |
| P-BANK | Bank txn → match/categorize → GL → source entity | *(batch2)* | **FAIL*** | 10424/10427 pending_categorization | TBD |
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
| 2026-07-21 | Ledger opened; P-EXPENSE/BILL/SETTLE FAIL documented |
| 2026-07-21 | Neon snapshot + P-CLAIM-LEGAL FAIL; bank/fuel/factor/invoice preliminary FAIL from counts |
| 2026-07-21 | P-CLAIM-LEGAL → #3175 FAIL; closed duplicate #3174; #3172 CI repair in flight |
