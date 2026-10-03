# ROUND 178 — SETTLEMENT DOCUMENT-TYPE AUDIT, AND WHO IS MATCHING THE BANK
2026-09-28, Laredo Central. Lead. Every number measured live under `neondb_owner` + `bypass_rls`.

## PART 1 — THE SIX DOCUMENT TYPES IN THE PDFs. **NONE IS MISSING.**
Parsed from `Company_Settlement_5819.pdf` and `Driver_Settlement_5819.pdf`:

| # | PDF section | App table | USMCA rows (all time) | On the 16 current loads |
|---|---|---|---|---|
| 1 | CUSTOMER CHARGES (Line Haul) | `accounting.invoices` | — | **16 of 16** ✅ |
| 2 | DRIVER PAYMENT (loaded/empty/picks/drops) | `driver_finance.driver_bills` | 121 | **2 of 16** ❌ |
| 3 | FUEL PURCHASES | `fuel.fuel_transactions` | 450 · $216,277.80 | **0** ❌ |
| 4 | EXPENSES (DEF, road service, tires) | `accounting.expenses` | 532 | **0** ❌ |
| 5 | Additional Pay (Enlonada / Desenlonada) | `driver_finance.driver_settlement_deductions` + add-pay | 67 | — |
| 6 | Settlement itemization | `driver_finance.settlement_lines` | — | **0** ❌ |

**Owner asked: insert any missing document TYPE in one pass. Answer: there is no missing type.**
All six exist in the schema and all six carry real USMCA history. Nothing to create.

**What is missing is POPULATION on the current 16 loads, and I will not fabricate it.** A fuel
purchase has a vendor, a location, an invoice number, gallons and a price per gallon — those come
from the card feed, not from me. Inventing them to fill a screen is the one thing the standard
forbids absolutely. Here is the real, fixable cause instead:

**THE FUEL FEED STOPPED ON 2026-09-24.** Latest `transaction_at` in `fuel.fuel_transactions` for
USMCA is **2026-09-24**. All 450 rows are linked to a load — **zero unlinked**, so this is not a
linkage bug. It is an **import gap: no fuel has been loaded for 09-25 through 09-28**, which is
exactly the window the current 16 loads have been running. That is why they show zero fuel.

**AND THE SOURCE FILES ARE ALREADY ON THIS MACHINE, UNIMPORTED.** In `~/Downloads`, covering
**2026-09-07 → 2026-09-25**:
- `09-25-26-DRIVER CARRIER EXPENSES.xlsx` — 94 rows (Item, Date, Vendor, Location, Invoice, Description, Driver, Carrier, Truck#, Load#)
- `09-25-26-DRIVER CARRIER ADD PAYMENT.xlsx` — 52 rows (Enlonada / Desenlonada, $25 each, with Load# and Settlement#)
- `09-25-26-DRIVER CARRIER DEDUCTIONS.xlsx` — 55 rows (Driver-Escrow For Claims, etc.)
- `09-25-26-CUSTOMER CHARGES.xlsx` — 65 rows (Line Haul, Customer, Load#, Settlement#, Invoice#, Invoice Date)

That is the one pass the owner is asking for — **import what exists, do not invent what does not.**

---

## PART 2 — WHO IS MATCHING SETTLEMENT TRANSACTIONS TO BANK TRANSACTIONS?

### **NOBODY. ZERO. MEASURED.**
```
banking.bank_transactions   (USMCA) : 911
banking.reconciliation_matches      : 0
```
**Not one of 911 bank transactions is matched to anything.** Not to an invoice, not to a factoring
advance, not to a settlement, not to a fuel purchase, not to an expense.

The match engine exists — Cursor built it across 7 PRs to the design in
`MATCHING LOGIC-BRAINSTORM-CLAUDE AGENT-09-23-26.docx` (the 3→7→From/To cascade, two surfaces,
multi-select with remainder re-rank, classify-before-offering). **PR 2, the accept flow, is the
missing half.** The engine can propose a match; nothing can commit one. So the table has stayed at
zero since the day it was created.

Until that lands, every claim about cash is unverified against the bank. The ledger balances against
itself, not against the bank statement — and those are different things.

---

# CURSOR — ROUND 178 (after Round 175 reversal is merged, not before)
**JOB — FINISH THE ACCEPT FLOW. 0 of 911 is the single worst number in this system.**
Build the commit side of the match engine: accept a proposed match, write
`banking.reconciliation_matches`, post the clearing entry, mark both sides matched, and make it
reversible through the **reinstate engine you are building in Round 175** — a match undone must leave
a trail, not vanish.

Match targets, all of them, not just invoices: `accounting.invoices`, `accounting.factoring_advances`
(Faro wires), `driver_finance.settlements` (driver pay out), `fuel.fuel_transactions` (card drafts),
`accounting.expenses`. A settlement's own transactions must be matchable as a set, because that is
how the money actually leaves the bank.

Guards: `verify-bank-match-has-clearing-entry.mjs` (no match without a balanced posting) and
`verify-match-is-reversible.mjs`. **Never auto-accept below a confidence the owner has set.** Never
match on amount alone — amount + date + counterparty, and the remainder re-rank as designed.

Proof: the count moving off zero, with the first accepted matches pasted, both sides shown.

---

# CC-2 — ROUND 178 — IMPORT THE FOUR EXPORTS, THEN CATCH UP FUEL
Adds to your Round 177 box; do Round 177 JOB 1 (driver pay) first.

**JOB A — Import the four `09-25-26-*.xlsx` files** (paths above), covering 2026-09-07 → 2026-09-25.
**Idempotent** — key on Invoice # / Load # / Settlement # so a re-run inserts nothing twice. 532
expenses already exist in USMCA, so a naive insert will duplicate. Report inserted / skipped / failed
per file, with the skip reason. **USMCA only. Transportation loads excluded. All expense documents
kept** — exactly as the owner ordered.

**JOB B — Fuel catch-up 2026-09-25 → today.** The feed stopped at 09-24. Find out why — Relay or Loves
API, a scheduled job that is not running, or a manual export nobody has pulled. **Name the cause**,
fix it, and import the gap. If the source has no data for those days either, say so plainly; do not
paper over it.

**JOB C — After A and B, re-measure the 16 loads** and report fuel / expenses / driver-pay counts
per load. That table is what tells the owner Load Costs and pre-settlements are real.

---

# CC-1 — ROUND 178 — THE COMPLETENESS GUARD
Adds to your Round 177 box.

**JOB — `verify-settlement-document-types-complete.mjs`.** For any settlement being closed, assert
every one of the six types above is either present or explicitly marked not-applicable with a reason.
A settlement that closes missing a whole document type fails the build. This is the permanent answer
to *"is any single type of document missing"* — it stops being a question somebody has to ask.

---

## STANDING
No fabricated rows, ever — not a fuel purchase, not an expense, not a settlement line. Import what
exists; name what does not. Highest ROUND wins. Report: what I did · the proof it's real · what's
next · tier used.
