# LAW-E2E — Safety Fine/Incident → Driver → Liability/Expense → JE (2026-07-21)

**BLOCK:** `LAW-E2E-SAFETY-FINE-LIABILITY-LINKAGE-2026-07-21`  
**MODULE:** safety (+ driver_finance liabilities / settlements)  
**WORKTREE:** `/private/tmp/ih35-law-e2e-batch3-20260721-204927` · branch `audit/law-e2e-batch3-money-ops-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `version=e64fc4c`  
**Neon:** `tiny-field-89581227` / `br-fancy-credit-akjnd07a` · READ ONLY  
**Discipline:** NEVER merge · NEVER Neon-apply · no STALE theater

Law §9: fine/incident money must reach driver + liability/expense + JE + audit, with reverse drill.

---

## Verdict (one line)

**FAIL overall.** Convert-to-liability wires **fine → `driver_liabilities` → settlement deduction** (repo PASS), but there is **no GL/JE/expense hop**, live fine/liability rows are **0**, and company-paid civil fines never post an expense JE.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| Blueprint §9 | Cross-module money + audit + reverse drill |
| McLeod | Driver chargeback / fine recovery on settlement |
| QuickBooks | Expense (company-paid) or AR/receivable (driver recovery) + JE |

---

## Neon row evidence (`app.bypass_rls='lucia'`)

| Relation / metric | Count | Implication |
|---|---:|---|
| `safety.civil_fines` | **0** | No live civil fine chain |
| `safety.internal_fines` | **0** | No live internal fine chain |
| `driver_finance.driver_liabilities` | **0** | No converted liabilities |
| `driver_finance.driver_settlement_deductions` | **0** | No seeded recovery deductions |
| JE postings with fine/liability source | **0** | (no fine source types observed among live JE legs) |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **Create civil fine** (`POST /api/v1/safety/fines`) | **PASS** (repo) · **FAIL** (live empty) | `fines.routes.ts` inserts `safety.civil_fines` with driver/unit/load optional FKs + audit. |
| 2 | **Create internal fine** (`safety-v5` / internal fines) | **PASS** (repo) · **FAIL** (live empty) | Approved path inserts liability + pending recovery. |
| 3 | **Fine → driver** | **PASS** (schema/repo) | `subject_driver_id` / `driver_id`; convert requires active driver. |
| 4 | **Convert → `driver_liabilities`** | **PASS** (repo) · **UNVERIFIED** (live) | `convert-to-liability` inserts `type='civil_fine'`, `origin='safety_fine'`, stamps `converted_to_liability_id`. |
| 5 | **Convert → settlement deduction seed** | **PASS** (repo) · **UNVERIFIED** (live) | `createSettlementDeduction` with `sourceType: "fine"`; `driver_settlement_deduction_id` on fine. Apply still gated by `SETTLEMENT_DEDUCTION_APPLY_ENABLED` (ON for 3 entities). |
| 6 | **Company-paid fine → expense / bill / JE** | **FAIL** | No `createJournalEntry` / `postSourceTransaction` / expense insert in `fines.routes.ts` or safety fine services. Bank pay link exists (`paid_via_bank_transaction_id`) without GL proof. |
| 7 | **Driver recovery → settlement JE** | **FAIL** (wiring dependency) · **UNVERIFIED** (live) | Recovery rides settlement pay-run; that path lacks `advance_recovery`/`driver_pay_expense` CoA designations and uses empty `catalogs.account_role_bindings` (see cash-advance / escrow audits). |
| 8 | **Reverse: Fine detail → liability** | **PASS** | `FineDetailDrawer` `EntityLink kind="liability"`. |
| 9 | **Reverse: Fine → bank txn (paid)** | **PASS** (UI) · **UNVERIFIED** (live) | `FinePaymentLinkBanner` EntityLink to bank txn. |
| 10 | **Reverse: Liability → fine / JE** | **UNVERIFIED** / weak | Liability origin fields exist; JE EntityLink from liability UI not proven in this pass. |
| 11 | **Audit** | **PASS** (repo) | `safety.fine.converted_to_liability`, `safety.internal_fine.*`. |

---

## Ranked CODE fixes

1. **P0 — Define GL model for fines (owner/CPA)** then implement  
   - Company-paid civil fine → expense (or bill) + JE + vendor/authority + optional unit/load.  
   - Driver-recoverable fine → receivable/liability already partial; must clear through settlement JE with `source` provenance back to fine id.  
   Guard: convert/pay → JE row with `source_id = fine_id`.

2. **P0 — Settlement deduction apply + pay-run CoA roles**  
   Without `driver_pay_expense` / recovery roles designated (and pay-run reading **primary** CoA roles, not empty legacy bindings), fine recovery never hits the books even when flags are ON.

3. **P1 — Liability detail reverse to originating fine + JE**  
   EntityLink both ways; surface `origin`/`origin_id`.

4. **P1 — Live smoke**  
   One civil fine convert + one company-paid path on TRANSP with RLS bypass proof.

5. **P2 — Incident → financial impact**  
   Accidents/incidents that spawn fines must carry `related_load_id` / `related_unit_id` into the liability/expense (partially present on civil fines schema).

---

## §9 checklist

| Box | Status |
|---|---|
| Money → vendor/customer + GL + audit | **FAIL** (no GL) |
| Money → driver / unit / load | **PASS** schema; **FAIL** live empty |
| Forward + reverse | Fine→liability UI **PASS**; JE reverse **FAIL** |
| RLS + audit | **PASS** repo patterns |
| No unwired poster | Fine path has **no poster** |

**REMAINING:** P0 GL model + CoA/settlement wiring. No Neon-apply in this PR.
