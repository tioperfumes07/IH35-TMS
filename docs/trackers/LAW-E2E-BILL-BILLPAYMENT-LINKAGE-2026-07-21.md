# LAW-E2E — Bill → BillPayment → JE linkage (2026-07-21)

**BLOCK:** `LAW-E2E-BILL-BILLPAYMENT-LINKAGE-2026-07-21`  
**MODULE:** accounting (Bills / Bill payment / A/P)  
**WORKTREE:** `/private/tmp/ih35-law-e2e-bill-2026-07-21` · branch `audit/law-e2e-bill-billpayment-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (matches)  
**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` · **READ ONLY** (no Neon-apply)  
**Discipline:** NEVER merge · NEVER Neon-apply · no WAVE STALE theater

Law of the Land (§9 Architecture Blueprint): every money hop must wire forward **and** reverse — vendor/AP/GL/JE/audit — with live evidence.

---

## Verdict (one line)

**FAIL overall.** Header bills exist (16,196) but **`accounting.bill_lines = 0`**, **`bill_payments = 0`**, **no JE legs with `source_transaction_type ∈ {bill,bill_payment}`**. Vendor create UI collects lines then **drops them into memo** — create API never persists `bill_lines`, so CHAIN-03 poster cannot post even when flags are ON.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §3 / §9 | Bill+BillPayment model; forward+reverse linkage |
| `docs/specs/QUALITY-STANDARD-LOCKED.md` | Trust over speed; no silent unposted money |
| QuickBooks A/P | Bill lines → A/P → Pay Bill → register drill |
| NetSuite AP | Vendor → bill → payment application → GL |

---

## Live flag state (Neon, RLS bypass `lucia`)

| Flag | `lib.feature_flags.default_enabled` | Overrides (`enabled=true`) |
|---|---|---|
| `BILL_GL_POSTING_ENABLED` | **false** | TRANSP · TRK · USMCA **ON** |
| `BILL_PAYMENT_GL_POSTING_ENABLED` | **false** | TRANSP · TRK · USMCA **ON** |

> Per owner instruction: **live posts remain UNVERIFIED** until a real Bill+BillPayment JE row is proven end-to-end. Flags ON + zero JE legs = **wiring FAIL**, not “working.”

---

## Neon row evidence (same txn, `app.bypass_rls='lucia'`)

| Relation / metric | Count | Implication |
|---|---:|---|
| `accounting.bills` | 16,196 | Headers present (mostly import/history) |
| `accounting.bill_lines` | **0** | **Poster cannot resolve DR expense legs** (`BILL_LINE_ACCOUNT_UNRESOLVED`) |
| `accounting.bill_payments` | **0** | No TMS bill payments recorded |
| `journal_entry_postings` where `source_transaction_type='bill'` | **0** | No bill JE legs live |
| `journal_entry_postings` where `source_transaction_type='bill_payment'` | **0** | No bill-payment JE legs live |
| `accounting.journal_entries` (all) | 7 | Unrelated / non-bill sources |
| `accounting.chart_of_accounts_roles` | 28 rows | `ap_control` designated (TRANSP/TRK active); settlement roles absent (see settlement audit) |
| `catalogs.account_role_bindings` active | **0** | Legacy fallback empty |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **UI Bill create** (`VendorBillForm` → `POST /api/v1/accounting/bills`) | **FAIL** | Form builds `TwoSectionLine[]` then submits only header fields + memo stub (`lines_preview:…`). `createBillBodySchema` has **no `lines`**. Files: `VendorBillForm.tsx` handleSubmit; `bills.routes.ts` schema; `bills.service.ts` `createBill`. |
| 2 | **`accounting.bills` header insert** | **PASS** (repo) / **PASS** (live count) | `INSERT INTO accounting.bills` in `createBill`; 16,196 rows on Neon. |
| 3 | **`accounting.bill_lines` persist** | **FAIL** | `createBill` never inserts lines. Live `bill_lines=0`. Maintenance/settlement posters that DO insert lines are **other paths**, not vendor Bill create. |
| 4 | **AP control resolve** (`ap_control` CoA role) | **PASS** (Neon designation) / **UNVERIFIED** (live post) | TRANSP+TRK have active `ap_control` → A/P accounts. No bill JE to prove CR ap_control live. |
| 5 | **Bill → GL JE** (`postBillGlIfEnabled` → `postSourceTransaction('bill')`) | **FAIL** (wiring) · **UNVERIFIED** (live success) | Flags ON for 3 entities, but `buildBillLines` **throws** when `bill_lines` empty (`posting-engine.service.ts` ~683–687). Live bill-sourced JE count = 0. |
| 6 | **Bill payment create** (`payBill` → `accounting.bill_payments`) | **PASS** (repo) · **FAIL** (live) | Route+service insert payment + update paid_cents. Neon `bill_payments=0`. |
| 7 | **Bill payment → GL JE** (DR ap_control / CR bank) | **PASS** (repo gate) · **UNVERIFIED** (live) | Atomic `postSourceTransactionInClientTx` when flag ON (`bills.service.ts` payBill). Live bp-sourced JE = 0. |
| 8 | **Reverse: Vendor → Bills** | **PASS** | `VendorDetail.tsx` A/P tab `EntityLink kind="bill"`. |
| 9 | **Reverse: AP Aging → open bills** | **PASS** | `APAgingPage` → `agingDrillThrough` → `/accounting/bills?vendor_id=&has_balance=true`. |
| 10 | **Reverse: Account Register → bill** | **PASS** (bill) / **FAIL** (bill_payment depth) | `AccountRegisterPage.sourceRoute`: `bill` → `/accounting/bills/:id`; `bill_payment` → **list only** `/accounting/bill-payments` (no per-payment detail). |
| 11 | **Reverse: Bill detail → vendor** | **PASS** | `BillDetailPage` `EntityLink kind="vendor"`. |
| 12 | **Reverse: Bill detail → lines / JE** | **FAIL** | `getBillDetail` returns bill + payments + audit — **no `bill_lines`, no `journal_entry_id`**. Payments grid has no JE `EntityLink`. |
| 13 | **Audit on create/pay** | **PASS** (repo) | `appendCrudAudit` `accounting.bill.created` / `accounting.bill_payment.created` / `accounting.bill.gl_post_failed`. |

---

## Accounting tabs that **must** show this money (inventory)

From `apps/frontend/src/pages/accounting/subnav-manifest.ts` (live grouped nav):

| Tab / surface | Path | Should show Bill/BP money? | Current wiring |
|---|---|---|---|
| Bill | `/accounting/bills` | Yes — open AP | List wired; deeplink `has_balance` |
| Vendor bill | `/accounting/bills/vendor` | Yes — create | **Lines not persisted** |
| Maintenance / Repair / Fuel / Driver bill | `/accounting/bills/*` | Yes | Separate posters; not this vendor-path proof |
| Multiple / Recurring bills | `/accounting/bills/multiple`, `…/recurring` | Yes | Out of hop scope; same line risk if shared create |
| Bill payment | `/accounting/bill-payments` | Yes | List + bill/vendor EntityLinks; **0 live rows** |
| Vendor balances | `/accounting/vendor-balances` | Yes | Balance from bills |
| Accounts payable | `/accounting/accounts-payable` | Yes | A/P surface |
| AP Aging | `/reports/ap-aging` | Yes | Drill to bills |
| Vendors | `/accounting/vendors` → Vendor detail | Yes | Bills + pay panel |
| Journal entries | `/accounting/journal-entries` | Yes — posted JE | **0 bill/BP source legs** |
| Account Register | `/accounting/account-register` | Yes — AP + bank | Source route partial for BP |
| All Transactions | `/accounting/transactions` | Yes | Depends on register/JE truth |
| Posting lineage | `/accounting/posting-lineage` | Yes | Needs source ids |
| Audit trail | `/accounting/audit-trail` | Yes | Audit events exist in code path |
| Chart of Accounts / CoA roles | `/lists/…`, `/accounting/settings/coa-roles` | Yes — `ap_control` | Designated for TRANSP/TRK |

---

## Ranked FAIL list (code fixes — Bill/BillPayment)

1. **P0 — Persist `bill_lines` on vendor Bill create**  
   Extend `createBill` + `createBillBodySchema` + `VendorBillForm` to write real `accounting.bill_lines` (account_id / category_kind+code). Guard: create → `bill_lines` count ≥1 → draft/post preview succeeds.

2. **P0 — Backfill / heal path for 16,196 header-only bills** (owner-gated financial)  
   Without lines, flags-ON entities cannot post. Need owner/CPA plan — not silent expense_default invent.

3. **P1 — Bill detail reverse: lines + JE**  
   `getBillDetail` must return lines + linked `journal_entry_id` / posting batch; UI `EntityLink` to JE.

4. **P1 — Bill payment detail drill from Account Register**  
   `sourceRoute('bill_payment')` must land on payment (or bill+payment highlight), not list-only.

5. **P1 — Live Bill+BillPayment JE proof** (after 1–2)  
   One TRANSP bill with lines → flag ON → JE legs → pay → JE legs. Until then: **UNVERIFIED live posts**.

6. **P2 — BillPaymentsList JE column**  
   Surface linked JE on payment rows (QBO/NetSuite parity).

---

## Acceptance (this audit PR)

```
ROOT CAUSE: Vendor Bill create never writes accounting.bill_lines; poster requires lines; live bill_lines=0 and bill/BP JE sources=0 despite flags ON.
FIX: docs-only evidence audit (this file). Code fixes listed ranked above — not in this PR.
GUARD: n/a (audit). Future: verify-vendor-bill-create-persists-lines.mjs (Rule 17 step file only).
LIVE PROOF: Neon counts (bills=16196, bill_lines=0, bill_payments=0, bill/bp JE=0); health sha e64fc4c; CoA ap_control designated.
REMAINING: code fixes P0–P2; owner Neon-apply only after code lands; no merge of money code without JORGE-APPROVED.
```

---

## Explicit non-claims

- Did **not** merge. Did **not** Neon-apply. Did **not** flip flags.
- Did **not** treat flags ON as proof of live posting.
- Settlement Bill+BillPayment engine is out of scope here → see companion settlement audit.

---

## CODE FIX follow-up — LANDED as #3172 (merged 2026-07-22)

PR #3172 (merged) implements ranked FAIL #1 (persist `bill_lines` on vendor create):

- `createBill` + `createBillBodySchema` accept `lines` and INSERT `accounting.bill_lines` in the **same** `withCurrentUser` txn as the header; fail closed on empty/mismatched lines.
- `VendorBillForm` / `createVendorBill` send real line payloads (no `lines_preview` memo stub).
- Guard: `scripts/verify-vendor-bill-create-persists-lines.mjs` + verify-step `1212-…` (Rule 17).
- **Out of scope / UNVERIFIED:** heal of existing ~16,196 header-only Neon bills (owner/CPA plan); live JE proof; posting flags stay untouched; no Neon-apply in this PR.
