# LAW-E2E — Invoice → AR → Payment → JE linkage (2026-07-21)

**BLOCK:** `LAW-E2E-INVOICE-AR-LINKAGE-2026-07-21`  
**MODULE:** accounting (Invoices / A/R / Customer payments)  
**PATH ID:** `P-INVOICE`  
**WORKTREE:** `/private/tmp/ih35-law-e2e-batch2-audit` · branch `audit/law-e2e-batch2-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (matches)  
**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` · **READ ONLY** (no Neon-apply)  
**Discipline:** NEVER merge · NEVER Neon-apply · no STALE theater  
**Master:** `docs/trackers/LAW-FULL-LINKAGE-AUDIT-MASTER-2026-07-21.md`

Law of the Land (§9 Architecture Blueprint): every money hop must wire forward **and** reverse — customer/AR/GL/JE/audit/load/driver/unit — with live evidence.

---

## Verdict (one line)

**FAIL overall.** Repo has Invoice create (incl. from-load), lines, posting engine (`INVOICE_AR_GL_POSTING_ENABLED`), customer payment apply + GL gate, and customer/AR aging reverse links — but live Neon shows **1 synthetic invoice** (`INV-2026-00001`, $0.01) with **`source_load_id=NULL`**, line **`account_id`+`qbo_item_id` NULL**, JE **posted then reversed** (net zero), **`payments=0` / `payment_applications=0`**, and Invoice detail has **no JE EntityLink**. Flags ON ≠ Law-complete path.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §9 | Money → customer + GL + JE + audit; load/driver/unit; forward+reverse |
| QuickBooks A/R | Invoice → Receive Payment → register drill |
| NetSuite AR | Customer → invoice → payment application → GL |
| ASC 606 | Revenue recognition on performance (load delivery) — needs load linkage |

---

## Live flag state (Neon, RLS bypass `lucia`)

| Flag | `default_enabled` | Overrides (`enabled=true`) |
|---|---|---|
| `INVOICE_AR_GL_POSTING_ENABLED` | **false** | TRANSP · TRK · USMCA **ON** |
| `CUSTOMER_PAYMENT_GL_POSTING_ENABLED` | **false** | TRANSP · TRK · USMCA **ON** |

> Flags ON + reversed $0.01 invoice + zero payments = **wiring/live FAIL**, not PASS.

---

## Neon row evidence (same txn, `app.bypass_rls='lucia'`)

| Relation / metric | Count | Implication |
|---|---:|---|
| `accounting.invoices` | **1** | Only `INV-2026-00001` (status=`sent`, total=$0.01) |
| `invoices` with `source_load_id IS NOT NULL` | **0** | **No load→invoice live link** (loads on Neon=10) |
| `accounting.invoice_lines` | **1** | Line exists but `account_id=NULL`, `qbo_item_id=NULL` |
| `accounting.payments` | **0** | No customer payments |
| `accounting.payment_applications` | **0** | No AR applications |
| JE postings `source_transaction_type='invoice'` | **4** | 2 AR/Rev + 2 **REVERSAL** legs for same invoice id |
| `posting_batches` for that invoice | **2** | Post + reverse batches |
| `chart_of_accounts_roles` `ar_control` active | **2** | TRANSP + TRK designated |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **UI Invoice create / from-load** | **PASS** (repo) · **FAIL** (live load linkage) | Routes: `POST /accounting/invoices`, `POST …/from-load` (`invoices.routes.ts`, `from-load.ts`). FE: `InvoiceCreate*`, list, detail. Live: sole invoice has `source_load_id=NULL` despite 10 loads. |
| 2 | **`accounting.invoices` + customer FK** | **PASS** | Neon row has `customer_id`; FE `EntityLink kind="customer"`. |
| 3 | **`accounting.invoice_lines` + income account resolve** | **FAIL** | Live line has no `account_id` / `qbo_item_id`. Current `buildInvoiceLines` **hard-fails** without resolvable income account (`InvoiceRevenueAccountError`). Historical $0.01 post used a path that left `source_transaction_line_id=NULL`. |
| 4 | **AR control CoA role** | **PASS** (designation) · **UNVERIFIED** (open AR books) | `ar_control` active TRANSP/TRK. Net JE for the only invoice is reversed. |
| 5 | **Invoice → GL JE** (`postSourceTransaction('invoice')`) | **FAIL** (live net) · **PASS** (repo gate) | Flag ON ×3. Live: posted then **REVERSAL** legs; invoice still `sent`. Detail UI has **no JE link**. |
| 6 | **Customer payment + apply** | **PASS** (repo) · **FAIL** (live) | `apply.service.ts` + `CUSTOMER_PAYMENT_GL_POSTING_ENABLED`. Neon payments/applications = **0**. |
| 7 | **Payment → GL JE** | **UNVERIFIED** (live) · **PASS** (repo) | No payment rows to prove. |
| 8 | **Load / dispatch reverse** | **FAIL** | Invoice detail shows load EntityLink but live `source_load_id` null. From-load not exercised in prod data. |
| 9 | **Driver / unit on invoice path** | **UNVERIFIED** | No live invoice tied to a load that carries driver/unit. |
| 10 | **Reverse: Customer → invoices** | **PASS** | `CustomerDetail` EntityLinks + AR aging drill (`agingDrillThrough`). |
| 11 | **Reverse: Account Register → invoice** | **PASS** | `AccountRegisterPage.sourceRoute('invoice')` → `/accounting/invoices/:id`. |
| 12 | **Reverse: Invoice → JE / payment JE** | **FAIL** | `InvoiceDetailPage` has payments EntityLinks when present; **no journal_entry EntityLink**. JE detail API `GET …/source-links` exists; **FE detail does not consume it**. |
| 13 | **Audit on create/post/pay** | **PASS** (repo) · **UNVERIFIED** (live volume) | Posting/payment paths emit audit; not re-proven on this $0.01 fixture. |

---

## Accounting / ops surfaces that must show this money

| Surface | Should show | Current |
|---|---|---|
| Invoices list/detail | Open AR | 1 fixture invoice; no JE drill |
| Customer detail / AR aging | Customer balances | Wired; empty real AR |
| Payments / apply | Cash applied | Lists exist; **0 live payments** |
| Journal entries / Account register | Invoice JE legs | Legs exist only as post+reversal |
| Dispatch load detail | Linked invoice | From-load code exists; **0 live links** |
| Factoring queue | Invoice for submission | FE links present; no production AR volume |

---

## Ranked FAIL list (code fixes — Invoice / AR)

1. **P0 — Enforce income account on every revenue invoice line before post**  
   Refuse create/send/post when line cannot resolve `account_id` or item default income account. Guard: planted invoice with null income → post fails closed.

2. **P0 — Make from-load the default production create path for load revenue**  
   Prove `source_load_id` populated on Neon for real loads; block “orphan” revenue invoices without owner override. Guard: invoice from load → `source_load_id NOT NULL` + customer match.

3. **P0 — Invoice detail → JE EntityLink (+ payment JE)**  
   Surface linked `journal_entry_id` / posting batch from source links; wire JE detail to existing `GET …/source-links`.

4. **P1 — Live customer payment E2E after P0**  
   One TRANSP invoice with resolvable lines → receive payment → `payment_applications` + `customer_payment` JE. Until then live payment hops stay UNVERIFIED.

5. **P1 — Heal / explain INV-2026-00001**  
   Fixture/reversed $0.01 must not be treated as AR proof; void or document as non-production seed.

6. **P2 — Driver/unit reverse via load**  
   Invoice detail (or load drawer) must show driver/unit from `source_load_id` when present.

---

## Acceptance (this audit PR)

```
ROOT CAUSE: Production A/R path has almost no real invoices; the sole row is a $0.01 load-less fixture whose JE was reversed, lines lack income accounts, and payments never landed — reverse JE drill on invoice detail is missing.
FIX: docs-only evidence audit (this file). Code fixes ranked above — not in this PR.
GUARD: n/a (audit). Future: verify-invoice-line-income-required.mjs + verify-invoice-from-load-sets-source-load.mjs (Rule 17 step files only).
LIVE PROOF: Neon invoices=1 (source_load_id null), payments=0, invoice JE legs=4 (incl. REVERSAL), health sha e64fc4c; flags ON for 3 entities.
REMAINING: P0–P2 code fixes; no merge of money code without JORGE-APPROVED; no Neon-apply from Cursor.
```

---

## Explicit non-claims

- Did **not** merge. Did **not** Neon-apply. Did **not** flip flags.  
- Did **not** treat flags ON or a reversed $0.01 JE as Law PASS.  
- Factoring of invoices → see `LAW-E2E-FACTORING-LINKAGE-2026-07-21.md`.
