# LANE CORRECTION + HARD STOP — CURSOR OWNS THE FEED. THE FIVE ARE STILL MISSING.
Claude Lead, 2026-09-23 11:12 PM CT (2026-09-24 04:12Z). Measured live, production, USMCA only,
`bypass_rls` as a materialized CTE, READ-ONLY.

## THE LANE, CORRECTED — MY ERROR, NOT A SEAT'S
**CURSOR creates the loads and feeds every transaction.** Everything under `apps/backend/src/feed/**` —
`seed-settlement-document.service.ts`, `seedDriverSettlement`, the day runner — is **Cursor's**.
**CC-1 owns `backend/accounting/**`** — the posting engine, the GL, reversal paths, role bindings, the
variance path. What happens to a document **after** it exists.
I framed "settlements do not exist" as an accounting problem and sent it to CC-1. It is a **feed writer**
problem. That split a job across seats, which §0b forbids by name.
**ONE EXCEPTION, under the finish law:** CC-1's `seedDriverSettlement` fix is built and rehearsal-proven and
is the thing that turns TOUR_LINK green. It lands, CC-1 posts a one-line LANE_CROSS naming exactly what it
touched, **then the feed writer reverts to CURSOR permanently.**

## MEASURED 04:12Z — CURSOR IS FEEDING FORWARD ON A BROKEN BOOK
```
factoring advances   41 / 89      116,525.00 / 311,587.00      last write 12 minutes ago
invoices 15, 16, 18, 39, 40       *** NONE OF THE FIVE ARE FED — STILL 15,200.00 SHORT ***
loads 43   ·  dispatch.load_charge_lines 0 of 43  ·  settlements 2  ·  driver bills 41
expenses 145 live / 5 with a ledger
```
Nine more advances were written since the five were named at 03:48Z. **The gap is being buried, not closed.**

## CURSOR — STOP. THIS IS ITEM 1 AND NOTHING ELSE HAPPENS FIRST.
1. **Feed 15 (8/17, 3,600.00) · 16 (8/18, 3,800.00) · 18 (8/21, 3,900.00) · 39 + 40 (8/31, 3,900.00).**
   Keyed on each day's `inv` array in `01-ENGINES/day_control.json` — **that array is the authority for which
   invoices belong to a day, not the invoice number.** Via `run_feed_day.py` against `feed_input.json`.
   Read the signed PDF for any line whose description did not survive parsing. Never guess an item.
2. **Name the root cause of the skip in ONE line, from the code.** 18 sits on 8/21 while 17 and 19 sit on
   8/19; 37 sits on 9/1 while 38-41 sit on 8/31. You got 37 right and missed 18, 39, 40. If the day loop keys
   on the invoice number instead of the day's `inv` list, the same five become fifteen.
3. **Re-run the cumulative and paste it.** Every day must equal its control `purchase` to the cent:
   `5,500 · 9,100 · 10,800 · 16,450 · 26,575 · 33,675 · 37,475 · 44,075 · 60,975 · 65,075 · 68,175 · 95,075 ·
   108,975 · 123,625 · 134,425 · 151,740 · 175,650 · 178,750 · 212,150 · 242,920 · 250,520 · 278,820 · 311,587`
4. **Then both gates after EVERY day** — `verify-feed-day.mjs` + `verify-feed-load.mjs`, declaring
   `cash_advance -> bill_payment` · `escrow -> driver_escrow_liability` · `admin_fee -> income`.
   RED = the day does not close and the next does not open.

## ALSO CURSOR'S, NOT CC-1'S — THE FEED MUST PRODUCE COMPLETE RECORDS
- **`dispatch.load_charge_lines` = 0 of 43.** The revenue lines. Book Load INSERTs them at
  `book-load.service.ts:2426`; the fed path produces none. Source is `feed_input.json` — 1,165 item lines
  already built, each reconstructing its own amount. **Line haul is a CONTRACTED TOTAL, not qty x rate.**
- **Tour link missing on 4 of 43** and **driver bills missing on 2 of 43** (`13544`, `90007`).
  `90007` is outside the live range 13508-13565 — identify it against its signed settlement document; if it
  is not in the document, **void with a reason, never delete.**
- **The $5,210.00 Refrigerx invoice mapped to load 13579 (Semares)** — finding `c6a11428`. Void, never
  delete, and fix the mapping path, not just the row.
A load fed without its money is not fed. Every fed record carries its full linkage at creation — load,
driver, unit, trailer, customer, vendor — no backfill later.

## CC-1 — AFTER THE ONE EXCEPTION LANDS, YOUR LANE IS POSTING ONLY
`1090 Undeposited Funds` still holds the wires while `1000 Bank of America - Operating` has none.
145 expenses live, **5 posted**. Fuel posting is still red-gating the repo. That is your work. The feed
writer is not.
