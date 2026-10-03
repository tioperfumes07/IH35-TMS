# STOP. FINISH THE FEED. NOTHING ELSE.
Claude Lead, 2026-09-23 11:30 PM CT (2026-09-24 04:30Z). Owner order, and it overrides every open round.

**THE PLAN HAS NOT CHANGED AND WE STOP DEVIATING FROM IT:**
Feed the 89 Faro invoices / **$311,587.00** across the 23 purchase days, 8/10 through 9/21 — and confirm
**everything balances**: every journal entry, every table, every bill, every expense, every driver bill,
every fuel row, every wire.

**NO NEW WORKSTREAMS. NO REDESIGNS. NO NEW OBJECTS.** If a task does not move the feed forward or prove the
feed balances, it is parked until the feed is done. That includes anything the Lead opened tonight that is
not on this page.

## THE FEED IS FED FROM THE SIGNED ALWAYSTRACK SETTLEMENT DOCUMENTS
A company settlement / driver settlement document **IS a tour IS a settlement.** One document ->
one tour/settlement header -> its loads inside it -> the driver bill, the expenses, the fuel, the cash
advances, the customer charges -> closed -> posted. Document-first. Never loose loads.
The engine for this already exists: `apps/backend/src/feed/seed-settlement-document.service.ts`, reading
`companyDoc.loads[]` from the AlwaysTrack truth JSON. Live result today: **32 loads, 0 tour links,
0 settlements.** Either that service never writes the header, or the feeder is calling a load-creation path
around it. **Establish which, from the code and the live rows, and report it in one line before writing
anything.** Do not build a new tour object. Do not build a booking-time assignment feature.

## SEAT BY SEAT — THIS IS THE WHOLE BOARD
**CURSOR** — feed, through **09/05 inclusive**. Hard stop there. 08/28 closes at **$95,075.00** cumulative
and is **$1,300.00 short** while 08/31 already has rows: close 08/28 before feeding forward. Run the
day-close gate after every day. RED = the day does not close and you do not open the next one. One line per
day, pushed, Central time stamp.

**DEVIN-A** — feed, **09/06 through 09/21 inclusive**, exclusive. Same rules. Post the 09/08 blocker
resolution and keep going. No stopping between days.

**CC-1** — make what the feed writes POST. Nothing else. In this order:
1. Why `seed-settlement-document.service.ts` produces 0 settlement headers. One line, from live evidence.
2. The document creates the tour/settlement, closed, through the existing engine. **No new GL math.**
3. Expenses post — 118 live, **0** with a ledger. `5000 Fuel & Diesel` is **$0.00** against **$42,891.08**.
4. Driver bills post — 30 live, **0** with a ledger.
5. The wires land in **1000**, not the **$78,154.74** sitting in **1090**.
Everything else you were given tonight is PARKED.

**DEVIN-B** — prove it balances. Nothing else. The day-close gate is live; keep it honest. Then the
trial-balance / balance-sheet guard: every JE balances · total debits = total credits · **Assets =
Liabilities + Equity**, both sides printed · every posting resolves to a live account with a non-null type ·
no residue at rest in 1090 · sign discipline (2150 and 2100 credit; 1230, 1245, 1250 debit) · 1150 returns
to 0.00 once POD posts · **no document class with zero ledger coverage** · no cost recognised twice.

**CC-2** — the daily whole-book reconciliation against the nine LAW figures, and only that.
`purchases $311,587.00 · AR $298,762.00 · receipts $12,825.00 · discount $4,673.82 · wire $220.00 ·
schedule $8.22 · escrow $4,530.19 · cash reserve $4,135.41 THE CONTROL · realized fees $4,902.04 ·
self-carried open $12,592.40 across 5 documents.` Banking match work is PARKED.

**CC-3** — one job: get the gate green so held branches merge. The parity red is **CASE A**, a real defect,
and it clears when CC-1 lands the settlement chain. Do not rescope, baseline or weaken the guard. Rebase
(50 behind) and be ready to push the instant it clears.

**CODEX** — 141.2 match window remains yours and remains controlling; it collides with nothing. Keep going.

## THE ONLY NUMBERS THAT MATTER TONIGHT
```
feed        33 / 89 invoices · $93,775.00 / $311,587.00 · 33 stamped · 12 days · latest 08/31
expenses   118 live /   0 with a ledger
driver bills 30 live /   0 with a ledger
fuel        63 live /  10 with a ledger
bills        0
loads       32 · 0 with a tour link · 0 settlements
5000 Fuel & Diesel $0.00   vs   $42,891.08 of fuel expenses
1090 Undeposited Funds $78,154.74 at rest
journal entries 117 · unbalanced 0 · debits = credits $262,725.40
```
Every one of those lines has to be right before anything new is started.
