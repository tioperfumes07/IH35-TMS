# DESIGN — Auto-apply customer payments (FIFO) + unapplied-payment alerts (HOLD)

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

> **STATUS: DESIGN ONLY · BUILD-AND-SHIP · DO NOT MERGE.**
> Doc-only. **NO migration, NO money code, NO flag flip.** Planning artifact for a future
> financial-cluster PR (Rule 13 SUPERSEDED by OWNER LAW 2026-08-03: no label, no owner Neon-apply — the coder applies on Neon and merges on green with proof; separate Builder /
> Financial-Accounting / GUARD agents). Doc-only exception: Rule 02 §Exception.
>
> - Block: `flow6-auto-payment-application` (accounting drain)
> - Branch: `design/flow6-auto-payment-application-hold` (fresh from `origin/main` @ `e2db37a74`)
> - Spec sources: Rule 01 blueprint set; Law of the Land linkage; CPA locks
>   (`.claude/skills/ih35-accounting-decisions`); Rule 07 never-delete.

---

## 0. Problem statement (the trust defect)

A customer payment can only be applied to invoices when the **caller supplies explicit target
applications**. There is:
- **no auto-apply mode** (apply a receipt to the customer's open invoices oldest-first / FIFO), and
- **no unapplied-payment alert** (a receipt that sits with `amount_unapplied_cents > 0` is invisible until
  someone manually opens it).

Result: cash received but not matched silently inflates unapplied cash and understates A/R collection —
exactly the "money in limbo" failure QuickBooks/NetSuite guard against with an auto-apply option + an
"unapplied payments" report.

This is **fix-not-patch** (Rule 16): the root is a missing application **mode** + a missing **surfacing**,
not a UI bug. The correct fix reuses the existing, tested `applyPayment` writer and posting kill-switch —
**no new GL math** (Rule 13).

---

## 1. Verified facts (evidence, not memory) — `origin/main` @ `e2db37a74`

### 1.1 Application requires explicit targets
- `apps/backend/src/accounting/payments/apply.service.ts:271` `applyPayment(client, input, actor)` takes
  `input.applications: PaymentApplicationInput[]`. `normalizeApplications` (`:52`) **throws
  `no_applications`** (`:68`) when the array is empty. There is **no** code path that derives the targets
  from the customer's open invoices.
- Per-target validation is already correct and reusable: invoice must be `sent`/`partial` and open-amount
  bounded (`applyToInvoice` `:140-145`), bill open-amount bounded (`applyToBill` `:206-210`), idempotent via
  `ON CONFLICT (payment_id, target_kind, target_id)` (`:160`, `:225`), and a FIFO-safe `FOR UPDATE` lock
  on the payment (`lockPayment` `:96`).

### 1.2 Overpayment already handled — but only as a credit memo, never re-applied
- When a payment still has `amount_unapplied_cents > 0` after invoice-only applications, `applyPayment`
  auto-creates an A/R credit memo (`createArCreditMemo` `:236`, called `:352-361`). There is **no** step
  that first tries to sweep the remainder across the customer's other open invoices.

### 1.3 GL posting is already gated + honest
- The receipt JE is posted through the **existing** engine only when the per-entity flag
  `CUSTOMER_PAYMENT_GL_POSTING_ENABLED` is ON (`:321-334`); OFF (default) records an append-only posting-flag
  skip (`recordPostingFlagSkip` `:337`) — never a silent success. Auto-apply must inherit this unchanged.

### 1.4 Create/void payment paths (where auto-apply would hook)
- `apps/backend/src/accounting/payments.routes.ts:202` `POST /api/v1/accounting/payments` and
  `apps/backend/src/accounting/customer-payments.routes.ts:117` `POST /api/v1/customers/:id/payments`
  create the payment; today the client then calls the apply endpoint with explicit targets.

### 1.5 No unapplied-payment surfacing
- No report/route/widget enumerates payments with `amount_unapplied_cents > 0` (grep: no `unapplied` report
  surface in `apps/backend/src/accounting` beyond the per-payment field itself).

---

## 2. Design — auto-apply mode (reuse the existing writer)

### 2.1 Additive, opt-in application mode (no behavior change when off)
Extend `ApplyPaymentInput` with an **optional** discriminated mode; default is today's explicit behavior:

```
mode?: "explicit" (default) | "fifo_open_invoices"
```

- `explicit` — byte-for-byte current behavior (caller supplies `applications[]`).
- `fifo_open_invoices` — **derive** the applications inside a single transaction:
  1. `SELECT … FROM accounting.invoices WHERE operating_company_id = $oc AND customer_id = payment.customer_id
     AND status IN ('sent','partial') AND amount_open_cents > 0 ORDER BY issue_date ASC, id ASC FOR UPDATE`
     (oldest-open first; deterministic tiebreak; row-locked to prevent double-apply under concurrency).
  2. Walk the list, consuming `payment.amount_unapplied_cents`, capping each application at that invoice's
     `amount_open_cents` (the exact bound `applyToInvoice` already enforces).
  3. Feed the derived rows through the **unchanged** `applyToInvoice` path (same validation, same
     idempotent upsert). Remainder after all open invoices → the **existing** credit-memo path (§1.2).
- **No new GL math.** The receipt JE still posts (or skips) exactly as §1.3.

### 2.2 Safety properties (must all hold)
- Entity-scoped: candidate invoices filtered by `operating_company_id` **and** `customer_id`; a cross-entity
  or cross-customer invoice is never a target (Rule 14).
- Idempotent + concurrency-safe: `FOR UPDATE` on payment + candidate invoices; re-running produces no
  double-application (existing `ON CONFLICT` upsert).
- Bounded: total applied ≤ `amount_unapplied_cents` (existing `amount_exceeds_payment_unapplied` guard `:306`).
- Determinism: `ORDER BY issue_date ASC, id ASC` — auditable, reproducible allocation.

### 2.3 Flag — OFF by default
- The *route-level* default stays **explicit**. `fifo_open_invoices` is only taken when the caller opts in
  **and** (optionally) a per-entity flag `PAYMENT_AUTO_APPLY_ENABLED` (default OFF) permits it, so an entity
  that wants strictly manual application can forbid the mode entirely. Flag flip = HOLD event.

---

## 3. Design — unapplied-payment alert / report (read-only)

- Add a read-only, tenant-scoped surface (route + Finance/AR home card): payments where
  `amount_unapplied_cents > 0 AND voided_at IS NULL`, aged by `payment_date`, with customer + amount +
  age-bucket. Read-only — no write, no posting; pure surfacing (McLeod/QuickBooks "unapplied payments").
- Additive only; nothing removed (Rule 07).

## 3.1 Linkage matrix (forward + reverse — Law of the Land §9)

| From | To | Mechanism |
|---|---|---|
| `accounting.payments` | `mdata.customers` | `payments.customer_id` (existing) |
| `accounting.payments` | `accounting.invoices` | `accounting.payment_applications` (existing; FIFO derives rows) |
| `accounting.payment_applications` | `accounting.invoices` | `payment_applications.invoice_id` (existing) |
| `accounting.payments` | `accounting.journal_entries` | existing receipt poster (flag-gated, §1.3) |
| unapplied report | `accounting.payments` | read-only aggregate on `amount_unapplied_cents > 0` |
| all mutations | `audit.audit_events` | append-only (existing helper) |

---

## 4. Acceptance[] (future PR — evidence before done)

1. **Default unchanged:** with no `mode` (or `PAYMENT_AUTO_APPLY_ENABLED` OFF), `applyPayment` behaves
   byte-for-byte as today; guard + test prove `no_applications` still throws on empty explicit input.
2. **FIFO correctness:** in a test entity, a payment auto-applies oldest-open first, caps each at open
   amount, stops at `amount_unapplied_cents`, and routes the true remainder to a credit memo; totals tie out.
3. **Concurrency:** two concurrent auto-applies on the same customer never double-apply (FOR UPDATE proof).
4. **Posting parity:** receipt JE posts only when `CUSTOMER_PAYMENT_GL_POSTING_ENABLED` ON; OFF records a
   posting-flag skip (no silent success). No new journal math in the diff (financial-agent confirms).
5. **Unapplied surfacing:** the report lists exactly the `amount_unapplied_cents > 0 AND voided_at IS NULL`
   payments for the tenant, correctly aged, read-only.
6. **Linkage:** §3.1 resolves both directions on live data; no orphan application, no unlinked payment.
7. **Guards wired (Rule 17)** via verify-steps; each fails on a planted regression.
8. **Deploy proof:** `/api/v1/healthz/shallow` `version` == merge SHA.

---

## 5. Guard plan — Rule 17 (no hot-file thrash)

Add `scripts/verify-<name>.mjs` + `scripts/verify-steps/<NNN>-verify-<name>.mjs` (next free ≥ `1210`; do
**not** touch `package.json` / locked-guards / ci.yml). `ctx.run` throws on failure (Rule 18).

| Guard | Asserts |
|---|---|
| `verify-payment-auto-apply-default-explicit.mjs` | default mode is explicit; `no_applications` still thrown; auto-apply behind opt-in + `PAYMENT_AUTO_APPLY_ENABLED` (default OFF). |
| `verify-payment-auto-apply-reuses-writer.mjs` | FIFO path routes through the existing `applyToInvoice` (no new INSERT into `accounting.journal*`; reuses the posting kill-switch). |
| `verify-payment-auto-apply-entity-scoped.mjs` | candidate query filters by `operating_company_id` + `customer_id`; deterministic `ORDER BY issue_date ASC, id ASC`; `FOR UPDATE`. |
| `verify-unapplied-payments-report-readonly.mjs` | the report route is read-only (no INSERT/UPDATE) and tenant-scoped. |

`scripts/verify-hold-merge-gate.mjs` already blocks merge without `JORGE-APPROVED` (flag-flip PR).

---

## 6. Explicit owner decisions required (system will NOT guess)

1. **Auto-apply allocation policy:** FIFO oldest-open (recommended, QuickBooks/NetSuite default) vs
   proportional vs due-date order? Confirm.
2. **Overpayment after FIFO:** credit memo (current behavior) vs leave as unapplied cash on account? Confirm.
3. **Enablement scope:** per-entity `PAYMENT_AUTO_APPLY_ENABLED` OFF by default; which entities opt in.
4. **Unapplied-payment age buckets** for the report (e.g. 0-7 / 8-30 / 31-60 / 60+).

## 7. Non-goals

- No TMS→QBO write-back (parallel books). No new GL math (reuse existing poster). No deletion/rename of any
  surface (Rule 07). No change to the void/credit-memo semantics beyond the additive FIFO remainder path.

## 8. Handoff

Owner rules §6 → Financial/Accounting agent reviews allocation policy → Builder ships one HOLD PR
(optional flag + auto-apply mode reusing `applyPayment` + read-only report + guards + acceptance evidence);
owner Neon-applies any flag seed; GUARD re-proves. This design stays HOLD / do-not-merge until owner directs.
