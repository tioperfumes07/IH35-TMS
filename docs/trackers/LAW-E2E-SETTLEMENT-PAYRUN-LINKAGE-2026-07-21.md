# LAW-E2E — Settlement → Pay-run close → CoA roles → JE linkage (2026-07-21)

**BLOCK:** `LAW-E2E-SETTLEMENT-PAYRUN-LINKAGE-2026-07-21`  
**MODULE:** settlements / driver-finance + accounting GL  
**WORKTREE:** `/private/tmp/ih35-law-e2e-settlement-2026-07-21` · branch `audit/law-e2e-settlement-payrun-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c`  
**Neon:** `tiny-field-89581227` / `br-fancy-credit-akjnd07a` · **READ ONLY**  
**Related open PR (NOT merged):** [#3149](https://github.com/tioperfumes07/IH35-TMS/pull/3149) — pay-run close → `resolveRoleAccountOptional` (PRIMARY `chart_of_accounts_roles`)  
**Discipline:** NEVER merge · NEVER Neon-apply · no WAVE STALE theater

Owner rule for this audit: **if settlement CoA roles are undesignated on Neon → FAIL for live post.**

---

## Verdict (one line)

**FAIL for live post.** On `main`, pay-run close still reads **`catalogs.account_role_bindings`** (0 active rows on Neon). Settlement CoA roles (`driver_pay_expense`, `advance_recovery`, recovery buckets, …) are **absent** from Neon `accounting.chart_of_accounts_roles`. `payrun_gl_runs=0`, `escrow_accounts=0`, settlement-sourced JE postings=0. **No frontend** calls `payrun-close` / `payrun-preview`. Flags ON for all three entities does **not** equal live wiring.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| Blueprint §3 | Settlements post as Bill+BillPayment (driver as vendor) — parallel pay-run JE path also exists |
| Blueprint §9 | Forward + reverse drill; GL + party + audit |
| CPA skill / locked decisions | Driver Escrow = **Liability**; 5% floor; no new GL math |
| McLeod / Alvys | Settlement → disbursement → escrow hold → GL drill |

---

## Live flag state (Neon, RLS bypass)

| Flag | Default | Overrides `enabled=true` |
|---|---|---|
| `SETTLEMENT_GL_POSTING_ENABLED` | **false** | TRANSP · TRK · USMCA **ON** |

Per owner: treat live JE posts as **UNVERIFIED** until a `payrun_gl_runs` row + JE legs exist. Flags ON + zero runs = **FAIL**, not theater PASS.

---

## Neon evidence (bypass `lucia`)

| Check | Result | Verdict |
|---|---|---|
| `driver_finance.payrun_gl_runs` exists | **yes** (`to_regclass`) | schema PASS |
| `payrun_gl_runs` row count | **0** | live post FAIL |
| `accounting.escrow_accounts` | **0** | escrow bridge FAIL for contribution |
| `catalogs.account_role_bindings` active | **0** | legacy fallback dead |
| `journal_entry_postings` `source_transaction_type='settlement'` | **0** | no settlement JE legs |
| `accounting.chart_of_accounts_roles` total | 28 | exists |
| Roles on Neon (TRANSP active set) | `ap_control`, `ar_*`, factoring suite, `property_tax_*`, `uncategorized_expense`, `undeposited_funds` | — |
| **`driver_pay_expense` designated** | **NO** | **FAIL live post** |
| **`advance_recovery` designated** | **NO** | **FAIL live post** |
| **`damage_recovery` / `lease_recovery` / `insurance_recovery` / `fuel_advance_recovery` / `other_recovery`** | **NO** | **FAIL live post** |
| **`abandonment_chargeback_recovery`** | **NO** (not even in `COA_ROLE_VALUES` on `main`; added in #3149 + held mig `202607710000`) | **FAIL** |
| **`escrow_liability_default`** | **NO** (pay-run uses per-driver `accounting.escrow_accounts` bridge — also empty) | **FAIL** |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | Settlement record (`driver_finance.driver_settlements`) | **PASS** (repo canonical) | Engine + detail UI on `/driver-finance/settlements` |
| 2 | Pay-run API mounted | **PASS** (repo) | `registerSettlementPayRunCloseRoutes` in `index.ts`; `GET …/payrun-preview`, `POST …/payrun-close` |
| 3 | Pay-run **UI** | **PASS** (repo this PR) · **UNVERIFIED** (live post) | `PayRunClosePanel` on `SettlementDetailPage` calls `GET …/payrun-preview` + `POST …/payrun-close`; JE legs + CoA Roles fail-loud. Live post still blocked by undesignated roles + #3149 + Neon 710000. |
| 4 | Flag gate | **PASS** (repo) | `SETTLEMENT_GL_POSTING_ENABLED` → preview-only when OFF; post when ON (`settlement-payrun-close.service.ts`) |
| 5 | Role → account resolve (**`main`**) | **FAIL** | Direct `FROM catalogs.account_role_bindings` (`resolveRoleBindingAccount`). Neon active bindings = 0 → `DRIVER_PAY_ACCOUNT_MISSING` etc. |
| 6 | Role → account resolve (**#3149**, unmerged) | **PASS** (repo on PR) · **FAIL** (live until designate) | Uses `resolveRoleAccountOptional` / PRIMARY `chart_of_accounts_roles`. Still FAIL live until owner designates settlement roles. |
| 7 | JE legs via `createJournalEntry` | **PASS** (repo math reuse) · **UNVERIFIED** (live) | Gross / recoveries / escrow / net cash legs documented in service header. Live settlement JE = 0. |
| 8 | Idempotency `payrun_gl_runs` | **PASS** (repo) · **FAIL** (live empty) | `INSERT … ON CONFLICT` then stamp `journal_entry_id`. Count 0. |
| 9 | Escrow sub-account (`resolveDriverEscrowLiabilityAccount`) | **PASS** (repo design) · **FAIL** (live) | Bridge `accounting.escrow_accounts` holder_type=driver; asserts Liability ≠ Faro reserve. Neon escrow_accounts=0. |
| 10 | Escrow ledger / balances write on close | **PASS** (repo) · **UNVERIFIED** (live) | Inserts `driver_finance.escrow_balances` + `escrow_ledger` when posting. |
| 11 | Reverse: Settlement detail → JE / payrun | **PASS** (repo this PR) · **UNVERIFIED** (live) | After close: `EntityLink` to `journal_entry` when `journal_entry_id` returned; shows `payrun_gl_run_id` when present. Flag OFF → explicit PREVIEWED badge (clears UNVERIFIED theater). |
| 12 | Reverse: JE detail → settlement | **UNVERIFIED** / likely weak | Account register maps `settlement` → driver payee; JE detail source drill not proven for pay-run JE `source` shape. |
| 13 | Reverse: CoA Roles page | **PASS** (mounted) | `/accounting/settings/coa-roles` in subnav + `manifest.tsx`. Cannot designate missing roles that aren't in enum until #3149/`202607710000`. |
| 14 | Reverse: Accounting Escrow page | **PASS** (UI) · **FAIL** (data) | `EscrowPage` EntityLink driver/vendor + JE; 0 escrow accounts → empty money. |
| 15 | Reverse: Banking Driver Escrow | **PASS** (surface exists) | `/banking/driver-escrow` + `DriverEscrowTabContent`. Must stay (never-delete). Live bridge empty. |

---

## Every Accounting / Settlements tab that should show this money

### Accounting (from `subnav-manifest.ts`)

| Tab | Path | Why it must show settlement/pay-run money |
|---|---|---|
| Settlements | `/driver-finance/settlements` | Canonical settlement list + detail |
| Pre-settlements | `/accounting/pre-settlements` | Upstream earnings → settlement |
| Dispute queue | `/accounting/dispute-queue` | Settlement disputes / corrective JE gate |
| Abandonment queue | `/accounting/abandonment-queue` | Chargeback recovery role |
| Escrow | `/accounting/escrow` | Per-driver liability sub-accounts + JE link |
| Journal entries | `/accounting/journal-entries` | Pay-run balanced JE |
| Account Register | `/accounting/account-register` | Driver-pay expense, escrow liability, cash, recovery accounts |
| All Transactions | `/accounting/transactions` | Same money, review surface |
| Posting lineage | `/accounting/posting-lineage` | Source settlement → JE |
| Audit trail | `/accounting/audit-trail` | Close / post mutations |
| CoA roles | `/accounting/settings/coa-roles` | Designate `driver_pay_expense`, recoveries, … |
| Chart of Accounts | `/lists/accounting/chart-of-accounts` | Underlying accounts for roles |
| Payment methods catalog | `/accounting/payment-methods-catalog` | Net disbursement GL account on method |
| Driver bill (Bills ▾) | `/accounting/bills/driver` | Blueprint Bill+BillPayment settlement path (sibling engine) |
| Bill payment | `/accounting/bill-payments` | Settlement BillPayment when that engine posts |
| AP Aging / Vendor balances | A/P surfaces | Driver-as-vendor A/P when Bill path posts |

### Settlements / Drivers nav (sidebar + driver-finance)

| Tab | Path | Why |
|---|---|---|
| Settlements | `/driver-finance/settlements` | Primary |
| Settlement Close | `/driver-finance/settlement-close` | Close arrival / lock path |
| Cash Advance Requests | `/driver-finance/cash-advance-requests` | Advance recovery input |
| Cash Advances | `/cash-advances` | Recovery ledger |
| Escrow (Drivers group) | `/accounting/escrow` | Liability hold |
| Deductions | `/drivers/deductions` | Bucket → `{type}_recovery` roles |
| Pre-Settlements | `/drivers/pre-settlements` | Upstream |
| Banking · Driver Escrow | `/banking/driver-escrow` | Virtual bank view of escrow |

**Missing UI hop (cleared this PR):** Pay-run preview/close controls on Settlement detail — API + UI wired. Live money still UNVERIFIED until designate + #3149 + 710000.

---

## Ranked FAIL list (code fixes — Settlement / Pay-run)

1. **P0 — Merge-ready #3149 (owner HOLD until approve)**  
   Repoint pay-run close off bare `account_role_bindings` onto `resolveRoleAccountOptional`. Without this, even designated CoA roles are ignored on `main`.

2. **P0 — Owner designate settlement CoA roles on Neon (after enum/mig)**  
   At minimum per TRANSP: `driver_pay_expense`, `advance_recovery`, bucket recoveries, `abandonment_chargeback_recovery` (needs #3149 + held `202607710000`). **Undesignated = FAIL live post** (this audit).

3. **P0 — Provision driver escrow bridges before first live close**  
   `accounting.escrow_accounts` count 0 → contribution cannot resolve. Wire/run `driver-subaccount-provision` for active drivers; prove Liability type.

4. **P0 — Frontend pay-run preview + close on Settlement surfaces** — **DONE (this PR)**  
   `PayRunClosePanel` calls `/payrun-preview` + `/payrun-close`; shows JE preview legs + posted `journal_entry_id` EntityLink; CoA errors link to CoA Roles. Guard: `verify-settlement-payrun-fe-wired.mjs`. Live post still UNVERIFIED until #3149 + designate + 710000.

5. **P1 — Settlement detail reverse drill** — **DONE (repo)** / **UNVERIFIED (live)**  
   Surfaces `payrun_gl_run_id` + JE EntityLink when ids returned; flag OFF clears UNVERIFIED via PREVIEWED badge.

6. **P1 — Live GUARD proof (post designate + #3149)**  
   One locked settlement → payrun-close with flag ON → `payrun_gl_runs` row + balanced JE + escrow ledger movement. Until then: **UNVERIFIED live posts**.

7. **P2 — Escrow split-brain HOLD (#3156)**  
   `accounting.*` vs `driver_finance.*` stores — resolve canonical before scaling live posts (do not patch).

---

## FE wire acceptance (this PR — #3168 hop 3/11)

```
ROOT CAUSE: Pay-run preview/close APIs mounted with zero frontend callers (Law §9 incomplete wiring).
FIX: PayRunClosePanel on SettlementDetailPage + driverFinance preview/close clients; preview GET accepts payment_method_id; response includes payrun_gl_run_id; CoA errors fail-loud → CoA Roles link.
GUARD: scripts/verify-settlement-payrun-fe-wired.mjs (+ verify-steps/1212).
LIVE PROOF: UNVERIFIED live post — depends on #3149 (resolver), owner CoA designate, Neon-apply 710000; flags ON ≠ posted books until payrun_gl_runs>0.
REMAINING: #3149 owner merge; Neon 710000; owner designate settlement roles; escrow provision; live GUARD after those land.
LINKAGE §9: Settlement → payrun-preview/close → JE legs (driver_pay_expense / recoveries / escrow / cash) → payrun_gl_runs → reverse EntityLink journal_entry + payrun_gl_run_id on detail; CoA Roles for designation gaps. No invented CoA designations.
```

---

## Acceptance (original audit PR)

```
ROOT CAUSE: On main, pay-run resolves GL via empty legacy account_role_bindings; settlement CoA roles undesignated on Neon; no UI for payrun-close; escrow_accounts=0; payrun_gl_runs=0.
FIX: docs-only evidence audit (this file). Code/Neon designate listed ranked — not applied here.
GUARD: n/a (audit). Existing verify-settlement-posters-use-coa-resolver.mjs covers #3149 once merged.
LIVE PROOF: Neon role dump (no driver_pay_expense); flags ON×3; payrun_gl_runs=0; escrow_accounts=0; health e64fc4c; #3149 OPEN.
REMAINING: #3149 owner merge gate; Neon-apply 710000; owner designate roles; FE pay-run; escrow provision; live GUARD.
```

---

## Explicit non-claims

- Did **not** merge #3149 or this audit into production deploy path beyond opening PRs.
- Did **not** Neon-apply migrations or designate roles.
- Did **not** call payrun-close against prod.
- Companion: `docs/trackers/LAW-E2E-BILL-BILLPAYMENT-LINKAGE-2026-07-21.md`.
