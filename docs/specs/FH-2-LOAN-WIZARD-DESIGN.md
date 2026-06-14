# FH-2 — Loan Wizard ("create everything") — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting). FINANCE block — designed live with Jorge, built **gated behind a flag default OFF**, **GUARD verifies the diff vs QuickBooks before merge**, never auto-fired, never self-merged.
**Audience:** Jorge + GUARD + accountant.
**Date:** 2026-06-14
**Part of:** the **Finance Hub** (FH-1…FH-7), Loans tab. **Consumes FH-1** (creates the fixed asset + depreciation schedule) and **FH-3** (creates the amortization schedule). Mockup approved by Jorge.
**Grounds:** QBO's loan-for-asset setup is a **manual multi-step process** (the documented gap) + locked accounting principles (double-entry balances or fails; VOID ≠ DELETE; `is_active` + soft-delete + audit; money-adjacent ships flag-OFF). All amounts integer cents.

---

## 0. Executive summary — and the QBO gap we close

In QBO, financing an asset is **many manual steps**: create the liability account, create the fixed asset, record the down payment, build the amortization schedule by hand, and post a balanced opening entry — each separately, easy to get wrong.

**FH-2 is one form → all transactions.** Jorge enters the deal once; the wizard **previews then creates** (gated, on confirm): the liability account, the FH-1 asset + its depreciation schedule, the down-payment transaction, the FH-3 amortization schedule, and a **balanced opening JE**. Nothing posts without Jorge's confirm; everything is audited.

---

## 1. Inputs (one form)

- **Asset(s)** — one or **multiple** assets on a single loan (each becomes an FH-1 asset). Per asset: name, VIN/serial, class (vehicles: truck/trailer/car), purchase price, and the asset's share of the financed amount.
- **Purchase price** (total) — the asset cost basis.
- **Down payment** + **from-which account** (the cash/bank account it's paid from).
- **Loan amount** (financed principal) = price − down payment ± trade-in/fees/taxes (§3).
- **Interest rate** (annual), **term (months)**, **first-payment date**, **lender**.
- Optional: **trade-in** value, **fees**, **taxes** (folded into the asset's original value, §3).

---

## 2. What it auto-creates (gated, preview-first)

On confirm (flag ON), atomically:

**(a) Liability account** — a **Note Payable / Loan Payable** in `catalogs.accounts`, named per the deal (e.g. "Note Payable — <lender> <asset>"). **Short-term vs long-term** chosen by term length (open question §6) — or one account with a current-portion handled in reporting.

**(b) Fixed asset(s) in FH-1** — creates the asset record(s) + their **book straight-line depreciation schedule** (FH-1, default 5y). Multiple assets → multiple FH-1 records, each with its share of basis.

**(c) Down-payment transaction** — **Cr the chosen cash/bank account** for the down payment (the cash leg of the opening entry, (e)).

**(d) Amortization schedule (FH-3)** — full schedule from loan amount / rate / term / first-payment date, stored, ready for gated per-payment posting.

**(e) Balanced opening JE** — posted via `createJournalEntry` (**balance-or-fail**):
```
Dr  Fixed Asset(s)            total purchase price (incl. trade-in/fees/taxes per §3)
   Cr  Note Payable                financed loan amount
   Cr  Cash / Bank                  down payment
```
(When there's a trade-in disposing an old asset, add its disposal legs per FH-1 §2.)

All five are shown in a **PREVIEW** (the exact accounts + amounts + the JE) **before** anything posts; **nothing fires without Jorge's confirm**; every created object writes an audit-spine row linking back to the wizard run.

---

## 3. Trade-in, fees, taxes (per QBO guidance)

- **Fees & taxes** (sales tax, doc fees, delivery) **capitalize into the asset's original value** — they increase the Dr Asset basis, not separate expenses (matches QBO fixed-asset guidance). Depreciation then runs on the full capitalized basis.
- **Trade-in:** the trade-in credit reduces cash/financed need; if a trade-in **disposes an existing FH-1 asset**, the wizard includes that asset's **disposal** (reverse its book value, post gain/loss — FH-1 §2) in the same preview.

---

## 4. Multiple assets on one loan

- The financed amount and the opening JE split across assets by their entered shares (Σ shares = loan amount; Σ basis = total Dr Asset).
- Each asset gets its **own** FH-1 record + depreciation schedule; the **loan** (FH-3) is one liability with one amortization schedule, linked to all the assets.

---

## 5. Data model (reuses FH-1 + FH-3; small wizard glue)

- Reuses **`finance.loans`** + **`finance.amortization_schedules/periods`** (FH-3) and **`fixed_assets.assets` + `depreciation_schedules`** (FH-1).
- Link table **`finance.loan_assets`** (loan_id ↔ asset_id ↔ financed_share_cents) for the multi-asset case.
- A **`finance.loan_wizard_runs`** audit record (inputs snapshot, the set of created object ids, actor, confirmed_at) so a run is fully reconstructable. `is_active` + soft-delete + audit cols.
- Flag `LOAN_WIZARD_ENABLED` in `lib.feature_flags`, default OFF. Tenant-scoped, RLS; new schema → grants per CLAUDE.md §15.

---

## 6. Open questions for Jorge

- **(a)** Typical **lenders**? (seed the lender list.)
- **(b)** Do loans ever cover **multiple assets** at once? (drives whether the multi-asset split UI is v1 or later.)
- **(c)** Liability account: **separate short-term vs long-term** Note Payable, or one account with current-portion in reporting?
- **(d)** Trade-ins — common? (drives whether disposal-in-wizard is v1.)
- **(e)** Which **entity first** — TRANSP (QBO-connected) then TRK?

---

## 7. Gated build sequence (migrations need accept-edits + show-the-migration-first)

1. `finance.loan_assets` + `loan_wizard_runs` glue (FH-1 + FH-3 tables already exist by then).
2. Wizard **form UI** (single form, multi-asset) — GUARD-mocked, Jorge-approved (mockup already approved).
3. **Preview builder** — compute all five artifacts (accounts, asset+schedule, down payment, amortization, opening JE) and render the preview; **no posting**.
4. **Create-on-confirm** behind `LOAN_WIZARD_ENABLED` (default OFF): atomic creation + balance-or-fail opening JE + audit run record.
5. Trade-in / fees / taxes capitalization + trade-in disposal.

All money-path; GUARD verifies vs QuickBooks; design session with Jorge before code.
