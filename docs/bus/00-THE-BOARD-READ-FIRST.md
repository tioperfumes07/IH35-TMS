# THE BOARD — FEED IN ONE LANE, THE REST KEEP BUILDING. CORRECTED.
Claude Lead, 2026-09-23 11:40 PM CT (2026-09-24 04:40Z). Replaces the 04:30Z "park everything" page —
the Lead over-corrected. **The feed runs in its own lane. It does not stop the other lanes.**

## LAW 5 — ONE SOURCE PER NUMBER. EVERY SURFACE SHOWS THE SAME LIVE DATA.
Owner: *"all should show current and real data always, they cannot show anything different in each one."*
The load board, load costs, the pre-settlement, the settlement, the driver settlement, the company
settlement, the P&L, cash flow and banking all render the **same number from the same source**.
- A downstream surface **READS. It never re-derives.** If two screens can disagree, one of them is computing
  its own version and that is the defect — not a display difference.
- No surface holds its own copy, its own filter, its own rounding, its own status list. One query, one
  producer, many readers.
- A number that cannot be computed returns **NULL with a reason and the screen says the reason.** Never 0.
  Zero is a claim that the value IS zero.
- **Load costs is the cost column of the pre-settlement, not a separate feature.**
- The round trip is the unit: **NB opens · TR extends · SB closes at Laredo.** OPEN = pre-settlement
  (live revenue and costs). CLOSED = settlement (frozen, posted). **One object, two states.**
- Every one of those surfaces carries the load's identity forward — load, driver, unit, trailer, customer,
  vendor. A surface that drops the load's identity is not done.

## THE FEED — ITS OWN LANE, TWO SEATS, NOBODY ELSE TOUCHES IT
Fed from the signed AlwaysTrack settlement documents. **A company/driver settlement document IS a tour IS a
settlement.** One document -> one tour/settlement header -> its loads inside it -> driver bill, expenses,
fuel, cash advances, customer charges -> closed -> posted. Document-first, never loose loads.
Engine: `apps/backend/src/feed/seed-settlement-document.service.ts`, reading `companyDoc.loads[]` from the
AlwaysTrack truth JSON. Live today: **32 loads, 0 tour links, 0 settlements.** Either that service never
writes the header or the feeder is calling a load-creation path around it — **CC-1 answers that in one line
from live evidence before anyone writes code. Do not build a new tour object.**

**CURSOR** — feed through **09/05 inclusive**, hard stop. **08/28 closes at $95,075.00 and is $1,300.00
short while 08/31 already has rows — close 08/28 before feeding forward.** Day-close gate after every day;
RED = the day does not close and the next one does not open. One line per day, pushed.
**DEVIN-A** — feed **09/06 through 09/21 inclusive**, exclusive. Same rules. Post the 09/08 blocker
resolution and keep moving.

## THE OTHER LANES — RUNNING IN PARALLEL, NOT PARKED
**CC-1 · the posting chain.** Why the settlement-document service writes 0 headers (one line, live evidence)
-> the document creates the tour/settlement, closed, through the existing engine, **no new GL math** ->
expenses post (118 live / **0** with a ledger; `5000 Fuel & Diesel` **$0.00** vs **$42,891.08**) -> driver
bills post (30 / **0**) -> the wires land in **1000**, not the **$78,154.74** at rest in **1090**.

**CODEX · the match window (141.2).** Controlling, unchanged, collides with nothing. Sticky bar
`Bank · Selected · Remaining` with one state-derived button; tiered list with exact combinations offered as
one row; selecting re-sorts to the remaining amount; cascade 3 days -> 7 days -> From/To; amount From/To in
integer cents. Matching posts nothing. Never auto-match.

**CC-2 · the matching engine backend + banking posts exactly once.** Build the **atomic multi-candidate
accept** contract CODEX needs — N selected documents in ONE transaction, all clear or none do; per LAW 4 it
**posts nothing** for already-posted documents, only a genuine variance leg. Categorize is the only place
Banking books a cost: `DR chosen account / CR 1000`, one bank line -> one JE -> N split lines each with its
own linkage, unbalanced blocked not warned. Resolve-difference writes to a **reason code**, never a raw
account picker. Then the daily nine-figure book reconciliation.

**CC-3 · LOAD BOARD, LOAD COSTS, PRE-SETTLEMENT, SETTLEMENT — MAKE THEM ALL SHOW THE SAME THING.**
This is the surface the owner named and it is yours. First get the gate green so held branches merge (the
parity red is **CASE A**, a real defect; do not rescope, baseline or weaken it — rebase, you are 50 behind).
Then: one producer per number, every screen reads it. Prove it by opening a load and showing the **same**
revenue, the same costs, the same driver pay and the same margin on the load board, in load costs, on the
pre-settlement and on the settlement. Any two that disagree — name the number, name both sources, fix the
one that re-derives. Guard: `verify-one-source-per-number.mjs`, self-arming, never a literal.

**DEVIN-B · prove it balances.** Day-close gate honest; then the trial-balance / balance-sheet guard —
every JE balances · debits = credits · **Assets = Liabilities + Equity** both sides printed · every posting
on a live account with a non-null type · no residue at rest in 1090 · sign discipline (2150, 2100 credit;
1230, 1245, 1250 debit) · 1150 returns to 0.00 once POD posts · **no document class with zero ledger
coverage** · no cost recognised twice.

## THE NUMBERS EVERY SEAT WORKS AGAINST (live, USMCA, read-only)
```
feed          33 / 89 invoices · $93,775.00 / $311,587.00 · 33 stamped · 12 days · latest 08/31
expenses     118 live /  0 with a ledger      driver bills 30 live / 0 with a ledger
fuel          63 live / 10 with a ledger      bills 0
loads         32 · 0 tour links · 0 settlements
5000 Fuel & Diesel $0.00  vs  $42,891.08 of fuel expenses
1090 Undeposited Funds $78,154.74 at rest
journal entries 117 · unbalanced 0 · debits = credits $262,725.40
```
