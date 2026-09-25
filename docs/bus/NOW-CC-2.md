# ROUND 153.6 — CC-2 — FIX USMCA FUEL SO THE COSTS GUARD GOES GREEN. START NOW.
Claude Lead, 09-25-2026 3:43 AM CT (08:43Z).

Owner, 3:42 AM CT: "fix it have cc1, 2 or 3 fix it."
CC-2 takes this: its own merge is blocked by this guard, and CC-2 knows the gate. When the guard is green you merge your match window in the same loop. CC-1 stays on items 2–3 (receipts, charge lines); it does not touch fuel. CC-3 stays on load boards. One writer on fuel: CC-2 only.

## Measured live 08:45Z, USMCA, bypass on (re-measure before you write)
| What | Count | $ |
|---|---|---|
| costs guard violations on main e589b91c1c | 656 (handwritten 539, wrong_credit_1090 117) | |
| fuel_event JEs: Dr 5000 / Cr **1090 Undeposited Funds** (all `source='import'`) | 324 | 145,337.20 |
| of those, still-live fuel buys | 265 | 125,567.64 |
| voided fuel buys whose 5000 was NOT reversed (void not whole) | 11 | 3,284.46 |
| live fuel buys with NO JE at all | 127 | 50,171.02 |
| live `fuel.fuel_transactions` USMCA total | 392 | 175,738.66 |
| AlwaysTrack fuel (parity ruler) | 171 lines | 110,072.33 |
| handwritten split: fuel_event 207 · factoring_advance 134 · driver_settlement 101 · factoring_default_interest 86 · journal_entry 11 | | |

## Law (closed, do not ask)
- E22: fuel is an EXPENSE. Payment account = the card: Relay → 1295, Dreamline → 2510, Amex → 2500. Never 1090. DEF → 5010, diesel → 5000.
- Void, never delete. Use the existing reversal engine (six exist; never write a seventh). No QBO write-back. No test or sample rows in USMCA.
- USMCA only. Fuel for TRANSP trucks stays with TRANSP. You do not write TRANSP. Void it out of USMCA with reason `belongs to TRANSP (shared card)`.

## Steps — one PR each, FAST-MERGE each (R-153.3)
1. **Truth set.** Match the 392 live fuel buys to AlwaysTrack's 171 fuel lines. Evidence: `data/alwaystrack/`, the parity ruler's fuel dimension, and the Relay/Dreamline/Amex statements on the Desktop. Join on date, amount, unit and card. Each buy lands in exactly one bucket: USMCA (in AT), TRANSP truck, or duplicate. Write the bucket list to `docs/bus/fuel-truth-2026-09-25.csv` (one row per fuel id, with the evidence). The sum of the USMCA bucket must equal 110,072.33 over 171 lines, or you state the exact residual line by line.
2. **Writer.** `apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts` must create an `accounting.expenses` row (source_fuel_transaction_id, payment_account = card account, unit/driver/trailer/load linked) through the expense engine. The JE comes from that expense. No bare JE, no 1090.
3. **Data.** For every USMCA-bucket buy: void the old 1090 JE through the reversal engine, then post it through the new writer. TRANSP and duplicate buys get voided with the reason, and their JE reversed. Fix the 11 voided-not-reversed. The 127 unposted buys in the USMCA bucket get posted through the writer.
4. **Guard.** Exempt `factoring_advance`, `driver_settlement` and `factoring_default_interest` by `source_transaction_type` only, each named with a comment explaining why (they are document engines, not hand-written). Leave the 86 default-interest JEs untouched and list them in the PR (not owner-approved, R-101.2). Review the 11 `journal_entry` rows one by one and post each correctly or state why. Replace the "Cursor fixes the WRITER / OUTBOX-DEVIN-B" text with "CC-2 owns the writer (R-153.6)".

## Proof required (paste in the PR, re-measurable)
- costs guard on main: `LIVE PASS … 0 cost JE violation(s)`
- parity fuel dimension: 110,072.33 / 171, exact
- 1090 postings: only factoring/escrow sources remain; fuel_event on 1090 = 0
- trial balance nets 0
- void-is-whole guard green

## Deadline and backstop
- Step 1 committed by 10:30Z. Guard green on main by 13:00Z (8:00 AM CT).
- The coordinator wakes cc3 the minute the guard is green. Then you FAST-MERGE your match window.
- Miss with no 429 note in NOW-CC-2 → the Lead takes the remaining steps.
---
Archived: docs/bus/archive/NOW-CC-2-2026-09-25-2.md
