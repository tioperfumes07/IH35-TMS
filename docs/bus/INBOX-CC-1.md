# INBOX-CC-1 · 2026-09-04 · Cursor lead re-dispatch (LOAD COSTS board columns)
`git pull --ff-only origin main`

★ OWNER LAW TODAY (all seats): FINISH your job COMPLETELY — the whole vertical:
schema + backend rule/poster + endpoint + screen WIRED + guard + Chrome-verified
+ merged + DEPLOYED, and each seat OWNS its items end to end. For the Load Costs
board that means the money columns read REAL on a live load in Chrome, not just
green guards. "Merged" is not "done." Deploy the backend after a green backend
merge (srv-d7rpem7avr4c73fhp4n0) and prove git_sha at /api/v1/healthz/shallow;
a migration is not shipped until you paste the information_schema read proving the
columns exist in production.


NOW — owner refined the LOAD COSTS BOARD column set today, verbatim, on your
granted surface (SURFACE-BREACH LoadDetailCostsTab / load-costs board still
yours). This is a quick per-trip expense line, NOT the detailed cost drawer.
Owner words:

  "STILL NEED THE PU DATE, PROJECTED DATE, WHICH IS THE DATE WE PUT WHEN BOOKING
   A LOAD; THE DEL DATE IS THE REAL DATE IT DELIVERED. I DON'T THINK WE NEED A
   STATUS COLUMN — A DRAFT SHOULD NOT BE HERE, SO IT SHOULD ONLY BE LIVE LOADS.
   I DON'T THINK WE NEED THE CATEGORY COLUMN. WE ALREADY HAVE THE LATE FEE COLUMN,
   LUMPER. QUICK EXPENSE OF THE TRIP, NOT DETAILED."

COLUMN SET (owner's exact list, in order):
  Load · Unit · Driver · PU Date · Del Date · Revenue · Late Fee · Lumper ·
  Fuel · R&M Exp · Other · Short Miles · Rate Loaded · Loaded Pay ·
  Empty Miles · Rate Empty · Deadhead Pay · Gross · On Time

RULES:
  - PU Date = PROJECTED pickup (the date entered at Book Load). Del Date = the
    REAL delivered date. Two different date semantics — do not conflate.
  - REMOVE the Status column (owner: no status; board shows LIVE loads only, a
    draft must never appear here — filter drafts out at the query).
  - REMOVE the Category column.
  - "On Time" is a derived flag under Del Date (real vs projected/appointment).
  - Money columns (Revenue/Late Fee/Lumper/Fuel/R&M Exp/Other/Loaded Pay/
    Deadhead Pay/Gross) are YOUR lane — real numbers, no fixtures, linked to the
    posting/GL, cents-correct. Owner is recording the FIRST live loads by hand
    right now and wants to SEE the costs on a live load — this must read real.
  - Empty Miles / Deadhead Pay blank (not zero) when unknown.

Rule 05 if any column rename touches the arch doc, same commit. Guard +
verify-step, same PR. Merged is not done — paste the live board read for a real
load. §0 Finish Law: one at a time.

Also still queued from the sign-trap block: the matched-state DB CHECK constraint
DDL CC-2 handed you (bank_transactions_matched_requires_matched_id) — apply when
a migration lane frees (CC-1 hours 00–11 UTC).

★ TWO REAL DEFECTS surfaced by the GATE-LIVELOCK static sweep — these are NOT rot,
DO NOT let anyone baseline them away, VERIFY on prod and fix at root (your money lane):
  (A) settlement-sample-tag — a LIVE PROD INSERT path is missing a required tag.
      CC-3 reported it as "a live prod INSERT missing a required tag." Find the
      exact INSERT, confirm whether it violates the no-seat-fixture / is_sample_data
      contract or a NOT-NULL tag column, fix at the write path + guard. This is
      money/data-integrity — own it end to end, prove on prod (information_schema /
      row read), deploy.
  (B) accident-liabilities VOID — the money-reversal side (JE/reversal correctness)
      of the accident-liabilities void. CC-3 wires the FE caller (safety-void-reachable);
      you own that the void posts a correct reversing entry, not a delete. Void = reversal.

Never POST. Never Chrome.

ACK `CC-1 | ACK | Load Costs columns + settlement-sample-tag + accident-void reversal · NEVER POST | GO`
