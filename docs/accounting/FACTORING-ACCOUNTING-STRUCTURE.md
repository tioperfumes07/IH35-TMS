# IH35 Transport — Factoring Accounting Structure
## Proposal & Implementation Guide

**Date:** Jun 7 2026  
**Prepared by:** Claude (AI) — confirmed against Jorge Munoz operational input  
**Status:** DRAFT — pending bookkeeper and CPA review  
**Related worksheet:** `docs/accounting/ROLE-BINDINGS-BOOKKEEPER-WORKSHEET.md`

---

## 1 — Overview

IH35 Transport currently factors invoices through **FARO Factoring**. A transition to RTS Financial is planned but not yet active. This document defines the complete accounting structure for transportation factoring — the journal entries required at each stage, the accounts involved, and the role bindings the posting engine needs to execute them correctly.

> **Ch. 11 DIP context:** All cash movement passes through the DIP operating account (WF - General Operating 6103). Any factoring advance receipt or reserve release must be posted to the DIP account, not legacy BOA accounts (closed Dec 2025).

---

## 2 — How Factoring Works (Step-by-Step Accounting)

### Step 1 — Invoice Created for Customer

When a load is completed and invoiced:

| | Account | Role | DR / CR |
|---|---------|------|---------|
| DR | Accounts Receivable (1100) | `ar_clearing` | Debit |
| CR | Revenue / Freight Revenue | *(revenue role)* | Credit |

---

### Step 2 — Invoice Factored (Sold to FARO)

When the invoice is submitted to FARO and FARO accepts it:

| | Account | Role | DR / CR | Notes |
|---|---------|------|---------|-------|
| DR | Factoring Advances Receivable — FARO | `factor_advances_receivable` | Debit | What FARO owes us (advance portion) |
| DR | Factoring Reserve Held — FARO | `factor_reserve_held` | Debit | FARO holdback (typically 10–20%) |
| DR | Factoring Fee Expense | `factor_fee_expense` | Debit | FARO's discount fee (typically 2–5%) |
| CR | Accounts Receivable (1100) | `ar_clearing` | Credit | Removes invoice from AR — FARO now owns the receivable |

> **Net check:** DR total (advance + reserve + fee) = CR Accounts Receivable (face value of invoice). The sum must balance.

---

### Step 3 — FARO Pays the Advance

When FARO wires the advance payment to IH35's DIP account:

| | Account | Role | DR / CR |
|---|---------|------|---------|
| DR | Cash — DIP Operating (WF 6103) | `cash_dip` | Debit |
| CR | Factoring Advances Receivable — FARO | `factor_advances_receivable` | Credit |

---

### Step 4 — FARO Releases the Reserve

When the customer pays FARO in full and FARO releases the holdback reserve to IH35:

| | Account | Role | DR / CR |
|---|---------|------|---------|
| DR | Cash — DIP Operating (WF 6103) | `cash_dip` | Debit |
| CR | Factoring Reserve Held — FARO | `factor_reserve_held` | Credit |

---

### Step 5 — Chargeback (Customer Fails to Pay)

If a customer does not pay FARO, FARO claws back the advance from IH35:

**5a — At time of chargeback notice (before repayment):**

| | Account | Role | DR / CR |
|---|---------|------|---------|
| DR | Accounts Receivable (1100) | `ar_clearing` | Debit | Re-books the receivable to IH35 |
| CR | Factoring Chargebacks Payable | `factor_chargebacks_payable` | Credit | Liability — IH35 owes FARO |

**5b — When IH35 repays FARO (cash):**

| | Account | Role | DR / CR |
|---|---------|------|---------|
| DR | Factoring Chargebacks Payable | `factor_chargebacks_payable` | Debit |
| CR | Cash — DIP Operating (WF 6103) | `cash_dip` | Credit |

**5c — If chargeback is resolved (customer eventually pays IH35 directly):**

| | Account | Role | DR / CR |
|---|---------|------|---------|
| DR | Cash — DIP Operating (WF 6103) | `cash_dip` | Debit |
| CR | Accounts Receivable (1100) | `ar_clearing` | Credit |
| DR | Factoring Chargebacks Payable | `factor_chargebacks_payable` | Debit | Clears the liability |
| CR | *(offsetting entry per CPA guidance)* | — | Credit |

---

## 3 — Chart of Accounts: Current Status & Required Actions

| Account | QBO Account Number | Status | Action Required |
|---------|-------------------|--------|----------------|
| Accounts Receivable | 1100 | ✅ Exists | None — already bound to `ar_clearing` |
| Cash — DIP Operating (WF 6103) | `QBO-1150040141` | ✅ Exists | Bind to `cash_dip` — **pending bookkeeper initials** |
| Faro Factoring Reserves | `QBO-1150040080` | ✅ Exists | Bind to `factor_advances_receivable` — **confirmed by Jorge** |
| Faro Escrow Account | `QBO-1150040084` | ✅ Exists | **Create new role** `factor_reserve_held` and bind here |
| Factoring Fee Expense | TBD | ⚠️ VERIFY | Check if a "Factoring Fee" or "Factor Fee Expense" account exists in QBO. If not, **create it** as an Expense account |
| Factoring Chargebacks Payable | *does not exist* | ❌ MISSING | **CREATE IN QBO** as a Current Liability, sync to catalog, then bind to `factor_chargebacks_payable` |

---

## 4 — Role Bindings Required (Posting Engine)

| Role | Account | Account Number | Status |
|------|---------|----------------|--------|
| `cash_dip` | WF - General Operating 6103 | `QBO-1150040141` | ⚠️ Pending bookkeeper initials |
| `factor_advances_receivable` | Faro Factoring Reserves | `QBO-1150040080` | ✅ Confirmed by Jorge Jun 7 2026 |
| `factor_reserve_held` | Faro Escrow Account | `QBO-1150040084` | ⚠️ New role — needs to be added to posting engine |
| `factor_fee_expense` | Factoring Fee Expense | TBD | ⚠️ Verify / create account in QBO first |
| `factor_chargebacks_payable` | Factoring Chargebacks Payable | *not yet created* | ❌ Create account in QBO → sync → bind |

---

## 5 — Implementation Checklist

### Bookkeeper / CPA Actions

- [ ] **Initials on `cash_dip`** — confirm WF - General Operating 6103 (`QBO-1150040141`) is the DIP operating account
- [ ] **Create "Factoring Chargebacks Payable"** in QBO as a Current Liability account
- [ ] **Verify or create "Factoring Fee Expense"** in QBO as an Expense account
- [ ] **Confirm Faro Escrow Account** (`QBO-1150040084`) should be bound to `factor_reserve_held`
- [ ] Review full factoring journal entry flow with CPA before activating in posting engine

### Operations / Engineering Actions

- [ ] **Sync new QBO accounts** to `catalogs.accounts` after bookkeeper creates them
- [ ] **Add `factor_reserve_held` role** to the posting engine role registry
- [ ] **Add `factor_fee_expense` role** to the posting engine role registry
- [ ] **Bind all roles** via `/accounting/settings/coa-roles` after accounts are confirmed
- [ ] **RTS transition:** When RTS goes live, add `factor_advances_receivable_rts`, `factor_reserve_held_rts` roles — do NOT overwrite FARO bindings

---

## 6 — Notes on DIP Context

Because IH35 Transport is operating under Ch. 11 bankruptcy (DIP), all cash accounts must correspond to court-approved DIP bank accounts. The BOA accounts were closed in December 2025. All factoring advance receipts and reserve releases should be directed to:

**WF - General Operating 6103** (`QBO-1150040141`) — the active DIP operating account.

Any change to the DIP bank account must be approved by the DIP lender and disclosed to the bankruptcy court. Notify the CPA and bankruptcy counsel before changing the `cash_dip` binding.

---

## 7 — RTS Transition Roadmap

When RTS Financial becomes active:

1. Do **not** remap existing FARO role bindings.
2. Create new parallel roles:
   - `factor_advances_receivable_rts` → RTS-Factoring Reserves (`QBO-248`)
   - `factor_reserve_held_rts` → RTS FINANCIAL-VIRTUAL ACCT (`QBO-247`) *(verify with RTS)*
   - `factor_chargebacks_payable_rts` → *(create new liability in QBO)*
3. Update the posting engine to route invoices to the correct factoring company's roles based on which company holds the invoice.
4. Update this document and the bookkeeper worksheet to reflect RTS bindings.

---

*IH35-TMS operations · Document version: 1.0 · Created: Jun 7 2026 · Database: `tiny-field-89581227` (IH35-TMS / Neon)*
