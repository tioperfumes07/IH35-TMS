# LEAD RETRACTION — 2026-10-02 — I WAS WRONG. THE TWO RESERVE POOLS ARE REAL. **KEEP 1235.**

**NO SEEDING, NO IMPORT, NO FEEDING.** The owner supplied Faro's own two reports — `Faro_Escrow_Reserve_Entries.csv` and `Faro_Cash_Reserve_Entries.csv` — **for understanding only.** He closes the
purchases himself. Nobody loads a row from them. They are the specification, not a data source.

## WHAT I GOT WRONG, AND WHY

I ruled three hours ago: *"one pool reported two ways — merge 1235."* My evidence was
`FARO ACCOUNT SUMMARY.csv` showing a single `"Escrow Reserve","0.00","5053.24"` line and no cash line.
**That was a snapshot taken at a moment the Cash Reserve happened to be 0.00** — and the entries show
it is swept to 0.00 constantly. I read an empty balance as a non-existent account. **Empty is a
question, not an answer, and I failed my own rule.** The ruling to merge 1235 is **void**.

## WHAT FARO'S ENTRIES ACTUALLY SHOW — TWO POOLS WITH DIFFERENT MECHANICS

```
Faro Reserve Report (owner's screen, 10/02/2026)
  Escrow Reserve   5,621.67 | Cash Reserve  -0.51 | Total Reserve  5,621.16 | Available for Release  -0.51
```

**ESCROW RESERVE — the contract's Security Reserve. Restricted. Per invoice.**
Only two note types in 135 rows: `Escrow Reserve Held` (+, 1.5% of net, at purchase, stamped to
invoice, PO ref and debtor) and `Transfer Escrow to Cash` (−, when that invoice is collected). It is
**held against a specific Purchased Account and it is not releasable while it sits here.**

**CASH RESERVE — cash on deposit with Faro. Available. Not per invoice.**
Five distinct movement types, and only one of them comes from escrow:
- `Transfer Escrow to Cash` (+) — the escrow for a collected invoice converting to cash
- `Rsv Deposit` (+) — **our own money wired to Faro** (5,000.00 "pago ccg"; 11,840.00 "Dinero en HOLD
  por facturas de Larralde"; 8,000.00; 2,000.00; 4,000.00; 3,000.00; 2,000.00; 15,000.00)
- `Client Payable` (−) — **Faro paying it out to us**, repeatedly sweeping the pool to 0.00
- `Schedule Fee` (−) — charged per invoice **against cash, never against escrow**
- short-pay lines (−) — e.g. `"Balance: 4000.00 :: Paid: 3750 :: 250.00 to Rsv"` → −250.00

**This is exactly what the contract requires and I should have seen it:** *"Faro shall never have an
obligation to release a Security Reserve for a Transaction that **has not been converted to cash on
deposit**."* **Escrow is the reserve not yet converted. Cash Reserve IS "converted to cash on
deposit."** The screen proves it — **"Available for Release" equals the Cash Reserve balance (−0.51),
not the total.** One is restricted, one is available. **Two accounts, two meanings, both assets.**

## RULING — CORRECTED AND FINAL

| GL | Name | What it is | Movements |
|---|---|---|---|
| **1230** | **Factor Reserve Holdback** | the contract **Security Reserve** — 1.5%, restricted, **per Purchased Account** | DR at purchase; CR on `Transfer Escrow to Cash` |
| **1235** | **Faro Cash Reserve** | **cash on deposit with Faro** — available for release, **pool-level, not per invoice** | DR from escrow transfers and our `Rsv Deposit`; CR on `Client Payable`, `Schedule Fee`, short-pays |
| **1236** | — | **still a duplicate of 1230.** Retires. | — |

**Correction 3 of ROUND 292 is withdrawn. Corrections 1 and 2 stand unchanged**: the single Security
Reserve account is **1230** and not 1236 (1230 carries the role `factor_reserve_held` and the history;
1236 was created 09-30 by a migration whose own comment records that it searched for "escrow", could
not find 1230, and made a duplicate), and accrued interest gets its own liability **2155** so **2150
always equals the Net Amount of open Purchased Accounts**.

`faro_bucket` is **no longer a presentation attribute** — it is the account itself. Drop it.
**`Transfer Escrow to Cash` is a real GL movement: DR 1235 / CR 1230**, invoice-stamped on both legs.

## FOUR THINGS IN THESE REPORTS NOBODY HAS BUILT

1. **"RESERVA NEGATIVA IH35" — THIS IS INTER-COMPANY AND IT IS NOT A USMCA COST.** Eight `Rsv Deposit`
   rows are USMCA money sent to Faro, and their notes say what for: *"Ajuste reserva negativa ih35"*,
   *"Pago a Reserva Negativa IH35"*, *"Pago a IH35 - Reserva Facturas Pagadas directo a ellos Larralde
   Transport"*, *"USMCA Reserve to IH 35 Reserve"*. **USMCA is funding IH 35's negative reserve.** That
   is a **due-from-affiliate receivable**, never a factoring fee and never a USMCA expense. If it books
   as cost, USMCA's P&L is overstated by every one of these. TRANSPORTATION stays frozen — **only the
   USMCA side of the cash moves, to an inter-company receivable.** Build the account and the rule.
2. **A NEGATIVE RESERVE IS A LIABILITY, NOT A NEGATIVE ASSET.** Cash Reserve is **−0.51 today** and has
   been far more negative. At period end a credit balance in 1235 reclassifies to a payable to Faro.
   A negative asset on the balance sheet is a defect; the reclass is the fix.
3. **SHORT-PAYS ARE AN A/R VARIANCE, AND FARO CHARGES THEM TO US.** `"Balance: 4000.00 :: Paid: 3750
   :: 250.00 to Rsv"` — the customer paid 3,750 against 4,000 and the 250 came out of our reserve. The
   invoice is **not** fully collected. That short-pay must land on the customer's A/R as a variance
   with a reason, never be absorbed silently into a reserve movement.
4. **SCHEDULE FEE IS CHARGED AT COLLECTION, AGAINST CASH.** It is a **Transaction Fee** under the
   contract, and it hits 1235 per invoice, after the escrow transfers — not at purchase. The fee
   taxonomy from the statement holds: **Discount Fee = the contract Factoring Fee; Schedule Fee and
   Wire Fee = Transaction Fees.**

## ONE IMPORT TRAP, FOR WHEN THE OWNER CLOSES PURCHASES HIMSELF

In the escrow report, row ID `405560` carries `Inv = "1013272-2"` and `PO Ref# = "059"` — **the two
columns are swapped on that row** relative to every other row. **Never assume Faro's column order
holds; validate each row's shape and reject the ones that do not match instead of importing them
wrong.** The owner is closing these by hand precisely so nothing wrong gets written.

## STANDING

Nobody seeds, imports, feeds, matches, categorizes or posts. **Build only.** Nothing posts from a timer
or a button; every entry is born from a real money movement matched in Banking or on Faro's statement.
Secured borrowing — the invoice stays in our A/R throughout. 100% per seat, no handoffs. The owner
verifies in Chrome when every build is complete.
