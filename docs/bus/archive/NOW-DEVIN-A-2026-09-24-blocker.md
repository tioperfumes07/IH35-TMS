# NOW — DEVIN-A — E23 — RULED. FIX IT YOURSELF, DO NOT WEAKEN IT, DO NOT WAIT.
2026-09-23 6:55 PM CT (23:55 UTC)

## YOUR FINDING IS CORRECT AND YOU WERE RIGHT NOT TO WEAKEN THE GUARD.
verify-pl-cost-of-revenue is red because revenue has posted and cost-of-
revenue accounts have not. That is real. It is also EXACTLY the same class
as the parity guard Devin-B fixed an hour ago: a guard asserting a FINISHED
P&L against a book that is ~6% fed.

## THE RULING — FEED-SCOPE IT. SAME SHAPE AS E12.3-R3. YOU BUILD IT.
Under the standing no-handoffs law, a blocker inside your own work is YOURS
to fix with a LANE_CROSS declaration. You do not post a finding and wait.

scripts/verify-pl-cost-of-revenue.mjs must assert only over loads whose
FULL COST CHAIN has been fed, not over every load with revenue.
  1. IN SCOPE = a load that is (a) live in mdata.loads for USMCA, AND
     (b) belongs to a Faro purchase day where EVERY invoice for that day
     exists live in accounting.invoices. That is the same CLOSED FEED SET
     Devin-B's parity guard already computes — read it, do not re-derive it.
  2. Assert the cost-of-revenue relationship over IN-SCOPE loads ONLY.
     A load with revenue and no costs yet, on a day still being fed, is
     NOT a violation — it is out of scope.
  3. PRINT EVERY RUN, always, even when everything skips:
       "P&L scope: N of X loads in scope, M skipped NOT FED YET"
  4. NO baseline file. NO flag. NO env var. NO date. NO hand-kept count.
     Scope is a POPULATION check and it arms itself as Cursor feeds.
     When 9/21 closes it asserts the whole book with no exemption left.
RED-BEFORE-GREEN: plant an IN-SCOPE load with revenue and zero cost — the
guard must FAIL naming that load. Remove it — the guard passes and prints
the scope line. Paste both runs.
LANE_CROSS: name the file, the owning seat, and that your three guards
cannot merge past it. Post the note to that seat's OUTBOX and keep going.

## CONTEXT YOU NEED — WHY COSTS ARE THIN RIGHT NOW
Lead measured live 23:30 UTC: 7 invoices / $16,450.00 revenue, and the only
cost-of-revenue posted is 5000 Fuel & Diesel at $7,250.20 on 10 lines.
There is NO driver pay (5100) because no settlement has posted yet — the
first posts when a tour's full load set lands (5769 waits on 13498, 5771 on
13504, 5772 on 13513, 5773 on 13497). That is correct behavior, not a gap.
And the 10 fuel postings are themselves being corrected right now — the
owner ruled fuel must be created as an EXPENSE through the canonical writer
with the real card as payment account, not as a hand-written JE crediting
1090. Cursor is reversing and re-creating them. So the cost side will move
again shortly. Your guard must tolerate that by scoping, not by baselining.

## THEN PUSH YOUR THREE GUARDS
scripts/verify-every-void-route-reverses.mjs
scripts/verify-no-voided-doc-has-live-postings.mjs
scripts/verify-baselines-are-post-wipe.mjs
UNNUMBERED files. Claim nothing, number nothing — "43" and "44" were TASK
numbers from the 48-register, that question is closed.
Each: baseline 0 · shrink-only · --write-baseline FORBIDDEN · self-arming
population exemption · wired into money-pr-local-gate.mjs · RED-BEFORE-GREEN
with BOTH runs pasted.
Gate green or the branch waits. No --no-verify. No GitHub Git Data API
publishing — that route is shut down.

---

DEVIN-A | 2026-09-23 9:52 PM CT (2026-09-24 02:52Z) | FEED BLOCKER — DAY 09/08

STOP AND REPORT. Day 09/08 cannot close. 6 invoices / $23,910.00 in the manifest.
5 of 6 have matching loads in feed_input.json. 1 does NOT:

  inv UNNUMBERED · Refrigerx Transportation LLC · PO 1013272-2 · $5,210.00
  → NO matching load in feed_input (124 loads from AlwaysTrack settlements).
  → NO matching rate confirmation. NO live DB row with WO 1013272-2.
  → Faro AGING REPORT confirms: invoice 405560, $5,210, purchased 9/8/26.
  → Without a load, the full chain cannot be created (no stops, driver bill,
    expenses, fuel, settlement). Day's wire legs would sum to $18,129.00
    (5 of 6) ≠ net advance $23,182.70 (6 of 6). STOPPER HOLDS.

The other 5 invoices for 09/08 DO have matching loads:
  inv 57 · ES Logistics · $2,200 → load 13575
  inv 59 · Armstrong · $3,500 → load 13577 (settlement period 09/05)
  inv 56 · ES Logistics · $4,400 → load 13574
  inv 60 · S E Mares · $4,900 → load 13571
  inv 58 · Refrigerx · $3,700 → load 13576 (settlement period 09/14)

ROOT CAUSE: The $5,210 Refrigerx invoice has no AlwaysTrack settlement
document. The load was likely delivered and invoiced to Faro but not yet
settled by AlwaysTrack. feed_input.json is built from settled documents only.

REQUEST: Owner decision needed — skip this invoice and feed 5 of 6 (wire
legs $18,129.00 ≠ $23,182.70), or hold day 09/08 until the settlement
document arrives.
