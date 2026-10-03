
---

# LEAD RULING — 2026-10-02 — THERE ARE TWO DIFFERENT ESCROWS AND THEY ARE NOT RELATED
Claude Lead. Chart-of-accounts ruling. No data touched.

## THE OWNER'S CORRECTION, VERBATIM

> "WHAT THE FUCK DOES ESCROW HAVE TO DO WITH FARO FACTORING OR RESERVE ACCOUNTS."

He is right, and this is the root of CC-2's whole finding. The word "escrow" is being used for two
things that have nothing to do with each other, and that is why two GL accounts exist.

## THE TWO THINGS — PERMANENT SEPARATION

**1. DRIVER ESCROW — a LIABILITY. We owe the driver.**
Money withheld from a driver's settlement against future claims or damage. It is the driver's money
that we hold. It lives in the **2100** series, with a per-driver sub-account (`2100-00-0NN`). It is
the **$25 default line in the Settlement Creator**. When the driver leaves, it is returned or applied.
**It has nothing to do with Faro, factoring, purchases, advances or reserves. Nothing.**

**2. THE FACTOR'S RESERVE HOLDBACK — an ASSET. Faro owes us.**
When Faro purchases an invoice it advances part of the face value and holds back the rest. That
holdback is a receivable from the factor, released when the debtor pays. It lives in **1230**, posted
by the role `factor_reserve_held` under the CPA's secured-borrowing rules
(migration `202607013000`).

A liability we owe a driver and a receivable a factor owes us are opposite sides of the balance sheet.
Calling both of them "escrow" is what produced a duplicate account.

**VOCABULARY LAW, EFFECTIVE NOW.** The bare word "escrow" means **driver escrow only** — in code,
in column names, in UI labels, in PDFs, in commit messages and in reports. The factor's holdback is
called **"reserve"** or **"factor reserve holdback"**, never "escrow". No seat writes
"escrow reserve" again; the phrase is the bug.

## THE ACCOUNT RULING — CC-2'S RECOMMENDATION IS ACCEPTED

CC-2's analysis is correct and well-sourced. The ruling:

**1230 stands as the single factor-reserve account.** It is CPA-defined, it is what the posting
engine actually books through `factor_reserve_held`, and it predates the duplicate.

**1236 is retired.** It was created on 09-30 by migration `202615000000` on a false premise — its own
comment says no escrow account existed, when 1230 had existed since `202607013000`. A seat created a
duplicate account because it searched for the wrong word. That is the vocabulary defect doing real
damage to the chart of accounts.

**1235 Faro Cash Reserve is untouched** — consistent, role `factor_cash_reserve_held`, bank account
agrees. Cash reserve and reserve holdback are two genuinely different pools and both stay.

**Renames, so the name carries the meaning and this cannot recur:**
- GL **1230** → **"Factor Reserve Holdback"** (from "Factoring Reserves")
- the bank account **"Faro Escrow Reserve"** → **"Faro Reserve Holdback"**, repointed from 1236 to 1230
- GL **1235** keeps its meaning; label it **"Factor Cash Reserve"** if it is not already
- the **2100** series is the only place the word escrow appears, and it reads **"Driver Escrow"**

## WHO BUILDS IT — NOT CC-2, AND THIS IS NOT A HANDOFF

CC-2 is right that its lane cannot author migrations. The chart of accounts is not CC-2's module —
it is a cross-cutting Lead concern, and I own it. **I author the migration and the repoint myself.**
CC-2 hands me nothing; it already did its job by finding and sourcing the conflict, which was the
hard part.

**CC-2's part, in code only:** once the migration lands, confirm `factoringBookReserveCents` and every
KPI, tile, drill and report read **1230 + 1235** and nothing else, and that no factoring surface
anywhere references 1236. Then rename every identifier, label and comment in your lane per the
vocabulary law — `escrowReserve`, `escrow_reserve_cents`, "Escrow Account" tab and friends become
reserve-holdback names. The Escrow Account tab on Factoring is **misnamed**, not misbuilt: it is the
factor's reserve holdback, and it must stop saying escrow.

**One named guard, mine:** fails if any factoring code path, column, label or PDF uses the word
escrow; fails if any driver-pay code path uses the word reserve for driver escrow; fails if 1236 is
referenced anywhere; fails if a second GL account is ever bound to the factor reserve role.

## CC-1 — THE SETTLEMENT CREATOR IS UNAFFECTED, AND NOW UNAMBIGUOUS

The $25 escrow line in the Settlement Creator is **driver escrow, 2100 series**. It has no connection
to Faro, to 1230, to 1235, to 1236, or to anything factoring. If you found yourself reading factoring
reserve code while building that line, stop — wrong account, wrong side of the balance sheet. Default
25, X to remove, its own subtotal in the roll-up, and it posts to the driver's own 2100-00-0NN
sub-account.

## STANDING
Build only. No seeding, feeding, matching, categorizing, live verification, backfilling, purging or
reposting by any seat. The owner decides on a purge himself, tonight. Orders cite files, call sites,
migrations and rulings — never row counts or balances.
