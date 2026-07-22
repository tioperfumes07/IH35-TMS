# LAW-E2E — Cash Advance → Settlement Recovery → JE (2026-07-21)

**BLOCK:** `LAW-E2E-CASH-ADVANCE-RECOVERY-LINKAGE-2026-07-21`  
**MODULE:** settlements / cash-advances / driver_finance  
**WORKTREE:** `/private/tmp/ih35-law-e2e-batch3-20260721-204927` · branch `audit/law-e2e-batch3-money-ops-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `version=e64fc4c`  
**Neon:** `tiny-field-89581227` / `br-fancy-credit-akjnd07a` · READ ONLY  
**Discipline:** NEVER merge · NEVER Neon-apply · no STALE theater

Law §9: advance money must link driver + liability + settlement recovery + GL/JE + audit, forward and reverse.

---

## Verdict (one line)

**FAIL overall.** Create path wires **advance → liability → deduction schedule** (repo), and pay-run close **intends** Cr `advance_recovery` + stamp `recovered_in_settlement_id` — but Neon has **0 advances / 0 settlements / 0 payrun GL runs**, **`advance_recovery` is not designated** in `chart_of_accounts_roles`, and pay-run close resolves roles **only** from empty `catalogs.account_role_bindings`.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| Blueprint §9 / driver Bill+BillPayment model | Advance recovery on settlement |
| QuickBooks | Employee/driver loan receivable + repayment JE |
| Alvys / McLeod | Advance issued → deducted on settlement |

---

## Live flag state (Neon, RLS bypass)

| Flag | Default | Overrides ON |
|---|---|---|
| `SETTLEMENT_GL_POSTING_ENABLED` | false | TRANSP · TRK · USMCA |
| `SETTLEMENT_CAPPED_RECOVERY_ENABLED` | true | TRANSP · USMCA |
| `SETTLEMENT_DEDUCTION_APPLY_ENABLED` | false | TRANSP · TRK · USMCA |

---

## Neon row evidence

| Relation / metric | Count | Implication |
|---|---:|---|
| `driver_finance.driver_advances` | **0** | No live advance hop |
| `driver_finance.driver_liabilities` | **0** | No paired liabilities |
| `driver_finance.driver_settlements` | **0** | No recovery host |
| `driver_finance.payrun_gl_runs` | **0** | No settlement JE claim rows |
| `catalogs.account_role_bindings` | **0** | Pay-run resolver source empty |
| `chart_of_accounts_roles` where `role='advance_recovery'` | **0** | Primary CoA designation missing |
| JE postings `driver_advance` / settlement recovery | **0** | No live recovery JE |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **Create cash advance** (`createDriverCashAdvanceCore`) | **PASS** (repo) · **FAIL** (live empty) | Inserts `driver_liabilities` + `deduction_schedule` + `driver_advances` + audit. Optional `load_id` / bank / bill links. |
| 2 | **Advance → driver** | **PASS** | `driver_id` required on insert. |
| 3 | **Disbursement JE (office create)** | **FAIL** / partial | Core create does **not** post JE. Banking path `bank-driver-advance.service` posts via `postSourceTransaction('driver_advance')` — separate entry; live unproven. |
| 4 | **Outstanding balance tracking** | **PASS** (schema) · **UNVERIFIED** (live) | `outstanding_balance`, `recovered_in_settlement_id` columns present. |
| 5 | **Settlement pay-run recovery math** | **PASS** (repo/tests) · **UNVERIFIED** (live) | `settlement-payrun-close.service` loads unrecovered advances, caps via `SETTLEMENT_CAPPED_RECOVERY_ENABLED`. |
| 6 | **Recovery → Cr `advance_recovery` JE leg** | **FAIL** (wiring) | `resolveRoleBindingAccount` reads **only** `catalogs.account_role_bindings` (0 rows). Does **not** call `resolveRoleAccount` / `chart_of_accounts_roles`. Would throw / skip when recovery > 0. |
| 7 | **Stamp `recovered_in_settlement_id`** | **PASS** (repo) · **UNVERIFIED** (live) | UPDATE under flag ON + post path. |
| 8 | **Reverse: Advance detail → liability / bank / settlements** | **PASS** (UI partial) | `AdvanceDetailDrawer` EntityLinks liability + bank; settlement history is text id, not EntityLink to settlement/JE. |
| 9 | **Reverse: JE / Account Register → advance** | **FAIL** / **UNVERIFIED** | No live `driver_advance` source legs; register depth not proven. |
| 10 | **Audit** | **PASS** (repo) | Create + pay-run close audits. |

---

## Ranked CODE fixes

1. **P0 — Pay-run role resolution must use primary CoA roles**  
   Replace/augment `resolveRoleBindingAccount` in `settlement-payrun-close.service.ts` to call `resolveRoleAccount(client, opco, role)` (primary `chart_of_accounts_roles` + legacy fallback). Guard: flag ON + recovery > 0 cannot resolve to null for `advance_recovery` / `driver_pay_expense`.

2. **P0 — Owner designate CoA roles on Neon** (owner Neon-apply — not this PR)  
   `advance_recovery`, `driver_pay_expense`, `driver_payroll_clearing`, recovery buckets. Currently **absent** from active `chart_of_accounts_roles`.

3. **P0 — Live E2E proof**  
   One TRANSP advance → settlement close with flag ON → JE legs + `recovered_in_settlement_id` set. Until then: **UNVERIFIED**.

4. **P1 — Office create path JE (or explicit bank-only rule)**  
   Either post receivable/cash on create (QBO loan pattern) or document that **only** bank categorize / bank-driver-advance posts disbursement — and enforce UI so unpaid advances cannot be “disbursed” without that hop.

5. **P1 — Advance detail EntityLink to settlement + JE**  
   Replace plain settlement id text with EntityLinks.

6. **P2 — Guard CI**  
   Static verify: pay-run close imports/uses `resolveRoleAccount` for settlement roles (prevent regression to legacy-only).

---

## §9 checklist

| Box | Status |
|---|---|
| Money → party + GL + audit | Create audit **PASS**; GL **FAIL** |
| Money → driver / load | **PASS** schema |
| Forward + reverse | Partial UI; JE reverse **FAIL** |
| RLS + audit | **PASS** patterns |
| No unwired poster | Pay-run poster **wired to wrong resolver** |

**REMAINING:** P0 resolver + CoA designations + live JE. No Neon-apply in this PR.
