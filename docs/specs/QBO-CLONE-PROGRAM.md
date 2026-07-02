# QBO → TMS Full Clone Program (master data + AR/AP sub-ledgers) — design spec

**Status:** design spec (Tier-3 docs). The engines it defines are Tier-1 financial → BUILD-AND-HOLD
behind `QBO_HISTORICAL_IMPORT_ENABLED` (OFF), owner-triggered, per the operating constitution §1.4.
**Owner decision that motivates this (2026-07-02):** *"Clone every transaction for the time period, for
each customer [and vendor] — invoices, payments, statements, all tabs — into our database. After that,
the QBO connection exists ONLY to reconcile and compare (what was added/deleted/changed in either
system)."* This is the same store-once / no-sync-back / reconciliation-module architecture already locked
for the GL (see `docs/specs/TMS-QBO-RECONCILIATION.md` and the QBO-IMPORT program), extended from the GL
to **master data + AR/AP sub-ledgers**.

This program is sequenced AFTER **IMPORT-P0** (the JE→QBO push kill-switch, merged) and composes with the
QBO-IMPORT GL program (IMPORT-0..4). It reuses the IMPORT-0 Reports client + exact-cents parsers.

---

## 1. Verified QBO data model (live pull, TRANSP realm 123145885549599, 2026-07-02)

Pulled from IH 35 Transportation LLC to ground the schema (NOT assumed):

- **Customers:** 158 with YTD sales; total AR sales YTD **$2,367,334.51**; top = Semares Forwarding
  ($279,900). Our `mdata.customers` already holds the superset (**1,209** rows — multi-year + archived);
  so master-data is *partly* cloned already, transactions are **not**.
- **Invoice (AR)** header fields (normalized): `qbo id` (opaque, decodes to realm + txn id e.g. `124460`),
  `reference_number` (DocNumber, e.g. `13374`), `txn_type` `SALE_INVOICE`, `txn_date`, `due_date`,
  `amount`, `balance_amount`, `contact` `{display_name, qbo id 869, email}`, `currency_info` (USD),
  `private_memo`, `custom_fields` (e.g. **`Work Order-`** — matches the locked TMS custom fields), and a
  deep **`link`** back into QBO (`.../invoice?txnId=124460`).
- **Invoice line:** `id`, `description` (e.g. `Load Number  - 13374 - Line Haul` — carries the TMS load
  number), `quantity`, `rate`, `amount`, **`item_name`** (`Sales of Service Income:Line Haul`), `item_id`,
  `taxable`. Item mapping ties to the CPA-locked "Sales of Service" / Line Haul revenue accounts.
- **Payments (AR):** surfaced via the invoice `LinkedTxn` set + the A/R Aging Detail `transaction_type`
  (`invoice` / `payment` / `credit memo`). Payment application is a link, not a field.
- **Vendors / Bills (AP):** mirror the AR shape (Vendor entity + Bill header/lines + BillPayment linked).
  Not yet pulled here; MD-2/MD-4 pull them the same way (A/P Aging Detail + Bill entity).

**Design consequences:** clone must preserve, per row: the QBO id (idempotency key), the DocNumber, dates,
amounts in **exact cents**, the customer/vendor QBO id (FK), line items + item mapping, custom fields (Work
Order / SB-Load No), the payment↔invoice **links**, and the QBO **deep-link** (so every cloned record can
open its QBO source — the "connections/links" the owner requires).

---

## 2. Architecture (locked)

1. **Clone once, then reconcile-only.** A one-time full backfill imports every customer/vendor + every AR
   invoice/payment and AP bill/bill-payment for the period into our tables. After backfill, the QBO
   connection does nothing but the twice-daily **reconciliation** (compare cloned vs live QBO; flag rows
   added/voided/changed in either system). No write-back to QBO (guarded by IMPORT-P0 for JEs; MD engines
   never enqueue a QBO push — `source_system` marks clone-origin rows).
2. **Store-once, exact cents (bigint).** Reuse IMPORT-0 `amountToCents`. Never `parseFloat`.
3. **Idempotent upsert by QBO id; void-never-delete.** Re-runnable through the whole QBO cleanup window;
   a row gone-from-QBO in the re-pulled window is **voided** (`voided_at` / supersede), never deleted.
4. **Per-entity isolation.** Every table `operating_company_id`-scoped, FORCED RLS, per-entity policies;
   realm↔opco hard assert on the *unrevoked* connection only (TRANSP `123145885549599`, TRK `1432746210`;
   USMCA has no QBO). Never cross realms.
5. **Links preserved.** Persist the QBO deep-link + payment↔invoice / billpayment↔bill links so every
   "tab" in a customer/vendor screen (Invoices, Payments, Statements, Transactions) renders from OUR DB
   and can jump to the QBO source. This is what makes the customer/vendor screens show "the same data as
   QuickBooks."
6. **Both bases.** AR/AP is accrual detail; the cash-basis view stays mirrored from QBO's own cash reports
   (per the GL program) — TMS never re-derives cash during the QBO-SoR window.

---

## 3. Blocks (dispatch order; each = one PR, Tier-1 HOLD unless noted)

Reuses IMPORT-0 (`qboReport`, `qboPaginateEntity`, `amountToCents`) and the IMPORT-2 schema pattern.

- **MD-1 — Customers full clone.** Pull every QBO `Customer` (active + inactive) → `mdata.customers`,
  upsert by `(operating_company_id, qbo_customer_id)`. Extend the existing projection to carry ALL fields
  + the QBO deep-link + `source_system='qbo_clone'`. Void customers gone-from-QBO. (Master data already
  ~partly present; this makes it complete + full-field.) *Tier-2 (catalogs/mdata data, no migration) —
  build-and-hold, owner triggers the run.*
- **MD-2 — Vendors full clone.** Same for QBO `Vendor` → `mdata.vendors`. *Tier-2.*
- **MD-3 — Schema: AR/AP clone tables + link tables.** CREATE-only migration: extend/confirm
  `accounting.invoices` + `accounting.invoice_lines`, `accounting.bills` + `accounting.bill_lines`,
  `accounting.payments` + application-link tables, all with `qbo_*_id`, `qbo_deep_link`, `source_system`,
  `voided_at`, FORCED RLS + grants. **`source_system` CHECK currently allows only ('tms','qbo')** — MD-3
  must decide: clone rows use `source_system='qbo'` + a `source='qbo_clone'` discriminator (no ALTER), OR
  widen the CHECK (gated). *Tier-1 HOLD.*
- **MD-4 — AR clone engine (invoices + payments).** Per customer, per period: `qboPaginateEntity`/report
  pull of `Invoice` + linked `Payment`; project header+lines+custom-fields+item-mapping+links →
  `accounting.invoices/invoice_lines/payments`; upsert by `qbo_invoice_id`; per-invoice balance assert;
  tie AR total per customer to QBO A/R Aging to the cent or fail loud. *Tier-1 HOLD, branch-proof first.*
- **MD-5 — AP clone engine (bills + bill payments).** Mirror of MD-4 for `Bill` + `BillPayment` →
  `accounting.bills/bill_lines/bill_payments`; tie to QBO A/P Aging. *Tier-1 HOLD, branch-proof first.*
- **MD-6 — Customer/Vendor transaction tabs (UI).** Behind the flag: render Invoices / Payments /
  Statements / All-Transactions tabs on the customer + vendor screens from the cloned tables, each row
  deep-linking to QBO. Additive, §7 palette, no sidebar change. *Tier-3 (read-only UI behind OFF flag) —
  ships on green.*
- **MD-RECON — Reconciliation extension.** Extend the twice-daily reconciliation to diff cloned
  customers/vendors/invoices/payments/bills vs live QBO: flag rows present in one system only (added or
  deleted), and field-level diffs (amount/date/status). Renders in the existing reconciliation surface.
  *Tier-1 (financial reconcile) HOLD.*

---

## 4. Owner hard-line rules baked in (do not relax)

- Merge = ship to prod; **financial/migration blocks NEVER self-merge** — build, prove on a Neon branch
  with real TRANSP+TRK pulls, show full SQL, owner labels + merges (§1).
- Reuse existing posting/GL functions — the clone writes sub-ledger rows, it does **not** post GL (GL is
  the separate IMPORT program). No new GL math.
- Every table: `operating_company_id`, `is_active`, audit, FORCED RLS, grants (0065 pattern).
- Exact cents; void-not-delete; idempotent upsert by QBO id; realm↔opco assert on unrevoked connection.
- Zero write-back to QBO — clone rows carry a clone `source` and are excluded from every outbound push
  (IMPORT-P0 already refuses non-`tms` JEs; MD engines never enqueue).
- USMCA has no QBO → excluded from clone; it is TMS-authoritative from day one.

---

## 5. Sequencing

IMPORT-P0 (done) → GL program IMPORT-0..4 (in flight) → **MD-1/MD-2** (master data, Tier-2) →
**MD-3** (schema) → **MD-4/MD-5** (AR/AP engines, branch-proof) → **MD-6** (tabs UI) → **MD-RECON**.
Each Tier-1 block waits for the owner's explicit OK-to-merge after its Neon-branch proof.
