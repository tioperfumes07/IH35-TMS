# Follow-on block — Charges as first-class line items (with per-line history)

**Sequenced after Block 06.** Removes the ceiling named in `BLOCK-06-EDIT-FULL-WIZARD-DESIGN.md`: today
a load's charges are a single `mdata.loads.rate_total_cents`, so the edit guard can only block the WHOLE
edit (no non-money edits on a settled/invoiced load) and there's no per-charge audit or GL attribution.

> **Gate:** FINANCIAL CLUSTER (new `accounting.*` table + migration). §1.4 — NEVER self-merge.
> Design-first (this doc), then build on Jorge's explicit OK with full SQL shown. Default flags OFF.

## 1) Standards deep-dive — how the market models load charges

**QuickBooks (Invoice/Bill `Line[]`):** every transaction is a header + N lines. Each line carries an
`Item`/`Account`, `Description`, `Qty`, `UnitPrice/Rate`, `Amount`, and optional `TaxCodeRef`. The header
total is the SUM of lines — never a free-standing scalar. Lines post to GL individually; once the
transaction is in a **closed accounting period** the line is locked (edits require reopening/adjusting).
Every line edit is captured in the audit log.

**NetSuite (transaction line items):** lines are first-class, each with item, account, quantity, rate,
amount, and a line-level memo; GL impact is computed per line. Lines have a stable line id; line-level
permissions + audit trail; closed-period lines are immutable (adjust via credit/debit memo).

**McLeod LoadMaster ("Other Charges" / revenue codes on an order):** an order's revenue is a list of
charge lines — `charge_code` (revenue type), description, `units`, `rate`, `amount`, and **who pays**
(prepaid / collect / 3rd-party). Each charge code maps to a **GL revenue distribution**. Charges become
read-only once the order is **invoiced**; corrections are made by revising/reissuing the invoice. Driver
pay is a parallel set of pay lines.

**Alvys / modern TMS:** load "rate items" — type (linehaul, FSC, detention, lumper, …), units, rate,
total; each references the settlement/invoice it landed on so money is traceable line-by-line.

**Common invariant across all four:** the header total is *derived* from immutable-once-posted lines;
each line has a type/code, an amount, a GL account, a payer, and its own audit + lock state. That is the
target model.

## 2) Proposed schema — `accounting.load_charge_lines` (entity-scoped, soft-delete, audit)
```
accounting.load_charge_lines (
  id                     uuid PK (UUIDv7, server-gen),
  operating_company_id   uuid NOT NULL,           -- RLS scope
  load_id                uuid NOT NULL REFERENCES mdata.loads(id),
  line_number            int  NOT NULL,            -- stable display order; UNIQUE(load_id,line_number) WHERE voided_at IS NULL
  charge_code            text NOT NULL,            -- LINEHAUL / FSC / DETENTION / LUMPER / TARP / ACCESSORIAL / ...
  description            text,
  quantity_milli         bigint NOT NULL DEFAULT 1000,  -- 3-dp fixed (units; 1.000 = 1000) — no floats
  rate_cents             bigint NOT NULL DEFAULT 0,
  amount_cents           bigint NOT NULL,          -- = round(quantity_milli * rate_cents / 1000); stored for audit
  charge_account_uuid    uuid REFERENCES catalogs.accounts(id),  -- GL revenue account (entity-scoped ledger)
  bill_to                text NOT NULL DEFAULT 'customer' CHECK (bill_to IN ('customer','prepaid','collect','third_party')),
  -- posting/lock state (set when a line lands on an issued invoice / closed period):
  posted_invoice_id      uuid REFERENCES accounting.invoices(id),
  locked_at              timestamptz,             -- non-null => line is read-only (issued/settled/closed-period)
  is_active              boolean NOT NULL DEFAULT true,
  voided_at              timestamptz,             -- void-not-delete
  created_at, created_by_user_uuid, updated_at, updated_by_user_uuid
)
```
- `security_invoker=true` on any view; GRANTs for `ih35_app` (accounting.* already granted; new table
  inherits via 0065 DEFAULT PRIVILEGES — confirm).
- **`mdata.loads.rate_total_cents` becomes a derived mirror:** keep the column (additive, no breakage),
  but it is recomputed = `SUM(amount_cents) WHERE NOT voided` on every line write (one writer).
- Append-only audit via `audit.append_event` on every insert/void/lock.

## 3) Migration plan (idempotent; one backfill)
1. Create `accounting.load_charge_lines` + indexes + GRANTs + RLS policy (`operating_company_id`).
2. **Backfill:** one line per existing load — `charge_code='LINEHAUL'`, `amount_cents =
   loads.rate_total_cents`, `charge_account_uuid` = the entity's linehaul-revenue account if resolvable
   (else NULL, surfaced as an honest CoA gap — never silently mis-mapped). Idempotent (`WHERE NOT EXISTS`).
3. No destructive change to `rate_total_cents`.

## 4) Service + guard changes (reuse, write NO new GL math)
- `bookLoad` writes charge lines instead of only summing (the create payload already sends `charges[]` —
  map each to a line; keep the rate_total_cents mirror in sync).
- **Block 06 PATCH upgrade:** the money guard moves to **line level** — when the load is invoiced/settled,
  lock only the posted lines (`locked_at IS NOT NULL`) and **allow** non-money edits (stop times, refs,
  notes) + edits to not-yet-posted lines. This is the QBO/NetSuite/McLeod behavior.
- Invoice generation reads charge lines → `accounting.invoice_lines` (already has `source_load_id`);
  stamp `posted_invoice_id` + `locked_at` on the lines that land on an issued invoice.

## 5) Out of scope (do NOT smuggle)
Tax codes per line, multi-currency rates, driver-pay line modeling (separate `driver_finance` lines
already exist), and DAT/RMIS auto-rating. Each is its own later block.

## 6) Verification
- New migration applied + idempotent re-run locally on `ih35_ci`; backfill count = load count.
- `verify:load-charge-lines-derived-total` (rate_total_cents == SUM(active lines)); RLS scope guard;
  line-lock guard (locked line cannot be amount-edited). backend tsc + targeted vitest.
- Full SQL + `git diff --staged --stat` shown to Jorge → **his OK to merge** (financial cluster).
