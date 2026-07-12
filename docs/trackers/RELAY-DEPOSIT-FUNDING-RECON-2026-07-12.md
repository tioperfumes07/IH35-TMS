# Relay Deposit Funding Reconciliation — 2026-07-12

**Purpose:** classify every dollar funded INTO the Relay account by its funding source, so
personally-funded deposits are booked as owner loans / capital contributions — never as company
cash and never as fuel expense. Owner directive 2026-07-12.

**Source (owner-verified independently, re-derived from the raw files this session — not trusted
from another agent):** `JAN-MARCH.csv` (March only) + `APRIL THROUGH JUNE.csv`. Deposit rows =
`type=deposit`; funding card = last-4 in the `Note` column (e.g. "9104. Card deposit").

## The three layers — NEVER summed
1. **Fuel pumped** (`type=code`, settled Mar–Jun): **$569,502.99** — the fuel-transaction table.
2. **Funded into Relay** (`type=deposit`, settled): **$590,053.13** — the Relay-wallet ledger (Part B).
3. **Paid to Relay from the bank** (`banking.bank_transactions`, TRANSP debits ILIKE relay): **$708,598.48**
   (Feb–Jul). Gaps between layers = timing (pump→fund→bank clears) + export covers only Mar–Jun.

## Deposit classification (settled only — canceled pre-auths are NOT money)
- Settled deposits: **163 rows = $590,053.13**
- Canceled pre-auth (excluded, not money): 119 rows = $471,026.54

| Funding card (Note last-4) | Deposits | Amount | Classification |
|---|---:|---:|---|
| 5007 (Amex Platinum) | 39 | $257,742.98 | **COMPANY** — Transportation Amex |
| 9104 (WF debit on checking …6103) | 91 | $246,251.26 | **COMPANY** |
| 9869 (WF debit on checking …6103) | 11 | $31,697.75 | **COMPANY** |
| **Company-funded subtotal** | **141** | **$535,691.99** | reconcile to bank outflows |
| 1222 | 11 | $20,650.01 | **UNCLASSIFIED** → owner names it |
| 3088 | 6 | $19,411.00 | **UNCLASSIFIED** |
| 1993 | 2 | $6,608.00 | **UNCLASSIFIED** |
| 6001 | 1 | $5,162.50 | **UNCLASSIFIED** |
| 9855 | 1 | $2,013.38 | **UNCLASSIFIED** |
| 1045 | 1 | $516.25 | **UNCLASSIFIED** |
| **Unclassified subtotal** | **22** | **$54,361.14** | **owner identifies each card** |

**Do NOT auto-label the six unclassified cards "personal" in code** — a company card never connected
to Plaid would also be absent from the bank feed. They are UNCLASSIFIED pending owner identification.
5007/9104/9869 are LIVE-VERIFIED company cards (GUARD vs prod `banking.bank_transactions`).

## What only the owner can resolve
Name each of the six external cards (1222, 3088, 1993, 6001, 9855, 1045): whose it is (owner / spouse /
other), or whether it is a company card not yet connected.
- **Personal** → book as **Loan from Owner (liability)** or **Capital Contribution (equity)**, tracked by
  the actual lender — never company cash, never fuel expense.
- **Unconnected company card** → connect it and reconcile like the rest.

## Verification method (§0 — verified this session)
- CSV side (deposit rows, card last-4, per-card totals): **re-derived from the raw exports this session.**
- Card→company-account identity (which cards are Transportation's): CSV shows the last-4; the
  bank-account ownership mapping is **UNVERIFIED against prod by this session** (prod DB is gated §1.5) —
  it rests on the owner's own account list. Owner confirms the six external cards.

## Booking status — HOLD-FOR-JORGE (financial cluster §1.4)
Deposit ingest + owner-loan/capital booking is **Part B ("Relay as a bank")** — financial, flags OFF,
no self-merge, no posting. The fuel-transaction CSV importer (PR #2395) deliberately **excludes all
deposit rows**; this recon feeds the separate Part B build once the owner names the six cards.
