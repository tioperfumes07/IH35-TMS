# HOLD-04 · CHAIN-06 — Invoice → A/R → Receive Payment (chain proof)

**Queue:** QUEUE 2 (HOLD / accumulate) · **Tier 1 — money posting**
**Tracker:** CHAIN-06 (row 1114)
**Status:** `[HOLD-FOR-JORGE — TIER 1]` — **do not merge. no flag flip. no live post.**
**Date:** 2026-06-18

> **Design doc, not posting code** (§1.4 / §1.7). Reuse existing GL; no new math, no migration, no flag.

## Reuse surface (existing)
- **Invoices** — `accounting.invoices` + `accounting.invoice_lines`; `invoices.service.ts`,
  `invoice-lines.routes.ts`. AR aging already reads these (`ar-aging.service.ts`).
- **Receipts** — `accounting.payments` + `accounting.payment_applications` (customer payment applied to
  invoice).
- **Poster** — `posting-engine.service.ts`; AR account resolved by the company AR mapping (mirror of
  `resolveApAccountForCompany`). Flag = `EXPENSE_GL_POSTING` analog / AR posting flag, **OFF**.

## Chain (invoice → A/R → receive), on paper
1. **Invoice issued** (`invoices` + `invoice_lines`) — already shipped. *(gated)* posts **Dr AR / Cr
   Revenue**.
2. **Receive payment** (`payments` + `payment_applications` against the invoice) — already shipped.
   *(gated)* posts **Dr Cash/Bank / Cr AR**.

## Draft JEs (dry-run; both balanced)
Invoice to a customer for a delivered load, **$3,400.00** (line revenue):
```
DRAFT JE #1 — source: accounting.invoices / <invoice_id>
  Dr  1200 Accounts Receivable                 $3,400.00
  Cr  4000 Freight Revenue (line account)       $3,400.00
  Σ Dr = Σ Cr = $3,400.00  → BALANCED ✔
```
Customer pays in full to the operating bank:
```
DRAFT JE #2 — source: accounting.payments / <payment_id> (applied to invoice <invoice_id>)
  Dr  1010 Operating Bank                       $3,400.00
  Cr  1200 Accounts Receivable                  $3,400.00
  Σ Dr = Σ Cr = $3,400.00  → BALANCED ✔
```
**Tie-out:** invoice AR balance $3,400.00 → $0.00 (status open → paid); revenue recognized once (at
invoice); the receipt is P&L-neutral.

> **Cash-basis note (TRANSP locked).** Under strict cash basis, revenue recognizes at **receipt**, not
> at invoice. Confirm with Jorge whether AR is carried (accrual presentation) with a cash-basis
> adjustment, or revenue defers to JE #2. This basis call drives the Cr side of JE #1. (Factoring via Faro
> adds a parallel advance/reserve path — out of scope here; see Factoring.)

## Gated for Jorge
Exact AR-posting flag (OFF) · confirm AR account mapping exists per entity · cash-vs-accrual revenue
recognition (drives JE #1 Cr) · authorize wiring → staging dry-run → flag ON.

## Guardrails
Reuse engine + invoices/payments infra · no new GL math · flag OFF · no live post · no migration ·
`[HOLD-FOR-JORGE — TIER 1]`, never merged.
