# LEAD — 2026-10-02 — CC-2's RESERVE MODEL IS APPROVED. ONE ACCOUNT CORRECTION, TWO GAPS CLOSED.

**APPROVED. Build it.** CC-2 reached the two-pool conclusion independently and from the same source,
and its arithmetic ties to the owner's screen **to the cent**. I verified both pools myself rather
than accepting the table:

```
ESCROW   +6,308.30 held (116 entries)  -686.63 transferred to cash (19)  = 5,621.67   ✓ screen
CASH     +686.63 from escrow  +50,840.00 Rsv Deposits (8)
         -51,138.87 Client Payable (7)  -260.00 short-pays (2)  -128.27 Schedule Fees (11)
                                                                  = -0.51       ✓ screen
TOTAL 5,621.16 · AVAILABLE FOR RELEASE -0.51 = the CASH balance alone        ✓ screen
116 + 19 = 135 escrow rows = the whole report. Nothing unexplained.
```

**That is what a measured finding looks like.** Both registers reconcile to Faro's own running balance
with no plug, and that reconciliation is the control the whole module hangs on.

**Approved as proposed:** each Faro report is the **bank feed for its account**; every report line
becomes a bank line on that register and **posts only when matched or categorized in Banking**;
`Escrow Reserve Held` is a component **inside the funding entry**, not a separate cash movement;
`Transfer Escrow to Cash` is one **paired transfer between the two reserve accounts**, invoice-stamped
on both legs; a negative cash reserve **presents as a payable to Faro, never a negative asset**; our
"Available for Release" equals Faro's; day 95 is **alert-only and posts nothing**; interest is shown
daily and **accrued once at month-end close**; and every reserve figure on every factoring page comes
from these two registers **through one query**, guarded.

---

## CORRECTION — THE ESCROW/SECURITY RESERVE ACCOUNT IS **1230**, NOT 1236

CC-2's table says "Escrow Reserve (1236)". **No.** This is the third time it has to be said, so here is
the evidence rather than the assertion:

- **1230** was created by migration `202607013000` §3g, carries the role **`factor_reserve_held`**, and
  holds the CPA ruling recorded verbatim in that migration: *"due-from-factor; the reserve is OUR
  asset, NOT a liability."* **It has the postings, the role and the binding.**
- **1236** was created on **09-30** by `202615000000`, whose own comment records exactly why: it
  searched `'%Escrow Reserve%'` and `'%Faro%Escrow%'`, found nothing, and created a second account.
  1230 is named "Factoring Reserves" — it contains neither word, so the search could not find it.

**Keeping 1236 means retiring the account that carries the history and keeping the one created by a
failed search.** 1230 is renamed **"Factor Reserve Holdback"** (ACCT-F9633) so the next search cannot
miss it. **Final map, and it does not move again:**

| GL | Name | Faro report | Nature |
|---|---|---|---|
| **1230** | Factor Reserve Holdback | **Escrow Reserve Entries** | Security Reserve — restricted, per Purchased Account |
| **1235** | Faro Cash Reserve | **Cash Reserve Entries** | cash on deposit — available for release, pool-level |
| **1236** | — | — | **duplicate of 1230. Retires:** assert first, refuse loudly if it carries a posting, bank account, role or binding; deactivate and hide rather than delete; repoint the reference |

So: `Escrow Reserve Held` → **DR 1230** inside the funding entry.
`Transfer Escrow to Cash` → **DR 1235 / CR 1230**, invoice-stamped both legs.

## GAP 1 — THE SCHEDULE FEE ROW IN CC-2'S TABLE IS EMPTY. HERE IT IS, MEASURED.

**11 entries, −128.27 total, charged against CASH at collection — never against escrow, never at
purchase.** It is a **Transaction Fee** under the contract (the Factoring Fee is the Discount Fee).
Rule: **DR factoring fee expense / CR 1235**, stamped to invoice and customer. Without this row the
cash pool does not reconcile — it is the exact difference between +127.76 and the −0.51 on the screen.
**A rule table with a blank row is an unbuilt rule.**

## GAP 2 — THE SHORT-PAY POSTING IS MISSING ITS A/R LEG

CC-2 lists short-pays (2 entries, −260.00) but gives no posting. The reserve leg alone is half the
truth: *"Balance: 4000.00 :: Paid: 3750 :: 250.00 to Rsv"* means **the customer paid 3,750 against
4,000 and Faro took the 250 out of our reserve.** The invoice is **not** fully collected.

Rule: **DR an A/R short-pay variance on that customer's invoice, with a reason code / CR 1235.** The
variance stays visible on the customer until it is collected, written off with approval, or disputed.
**A customer shortfall silently absorbed into a reserve movement is exactly the money theatre the gate
forbids** — and it would quietly understate what that customer owes.

## THE INTERCOMPANY RULE — SAY IT PRECISELY, BECAUSE TRANSPORTATION IS FROZEN

CC-2 has the direction right. The precision that matters: **both legs are USMCA-side only.**

- `Rsv Deposit` **"USMCA Tank"** (8 entries, +50,840.00) — notes *"pago ccg"*, *"ajuste reserva
  negativa ih35"*, *"Dinero en HOLD por facturas de Larralde"*. **Our money going to Faro:** DR 1235 /
  CR the bank we paid from. Where the note says it funds IH 35's negative reserve, it is a
  **due-from-affiliate receivable**, never a USMCA expense.
- `Client Payable` (7 entries, −51,138.87) — *"Pago a IH35"*, *"USMCA Reserve to IH 35 Reserve"*. Paid
  to **us**: a transfer to our bank. Routed to **IH 35**: **DR due-from-affiliate / CR 1235, never
  income.**
- **Write only the USMCA side. TRANSPORTATION and TRUCKING stay frozen — do not read, write or report
  on them.** Booking any of this to cost or income overstates USMCA's P&L by up to $50,840.00, which
  is why it is called out here rather than left to a categorization rule.

## STANDING — AND THE OWNER'S LINE ON THESE FILES

**The two reports were shared for understanding only. Nobody imports, seeds or feeds a row.** The
owner closes purchases himself and he runs the import path — **CC-2 builds it and does not run it.**
When that path is built: **validate every row's shape and reject what does not match** — escrow row ID
`405560` has `Inv` and `PO Ref#` swapped relative to every other row, and an importer that assumes
Faro's column order will write it wrong.

Nothing posts from a timer or a button. Secured borrowing — the invoice stays in our A/R throughout.
2150 Factoring Advance always equals the Net Amount of open Purchased Accounts; accrued interest goes
to **2155**, never to 2150. Build only, 100% per seat, no handoffs. The owner verifies in Chrome when
every build is complete.

**CC-2: your five build items are approved in your order. Correct 1236 → 1230 in the order on the bus
before you start, add the Schedule Fee rule and the short-pay A/R leg, then build.**
