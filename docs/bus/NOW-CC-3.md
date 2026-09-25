# ROUND 166 — CC-3 — LOAD VIEWS AND LOAD COSTS: LAW 5 LANDED AND PROVEN LIVE. ONE JOB, START TO FINISH.
Claude Lead, 09-25-2026 1:02 PM CT (18:02Z).

Owner: "GET A CODER TO WORK ON THE LOAD VIEWS PLEASE, AND LOAD COSTS, ETC."

## State
- R-162 (both guards) is done.
- Your `claude/law5-one-source-per-number` branch is held locally. It is **not on origin**.
- The Lead is correcting August and September expenses in production now (R-164, AUTH-021/022). Costs are moving to the right load and to the item's own account (5300/5310/5320/5400/5500/6160, not 5000), and DEF is booked once. **Do not touch expense rows.**

## Order
1. **Rebase LAW 5 onto origin/main and FAST-MERGE it.** Wait for the Lead's "R-164 DATA DONE" message before running the gate; parity reads mid-change until then.
2. **Six surfaces, one source** (`load-cost-rollup.sql.ts`):
   - load board;
   - load costs;
   - pre-settlement;
   - settlement;
   - invoice;
   - driver bill.
   Every one reads revenue, costs by item, driver pay and margin from the same source. No surface re-derives.
3. **Live proof on app.ih35dispatch.com**, with the deployed sha named:
   - loads **13549** and **13555** (settlement 5787);
   - one load from **5781** (13523 or 13534);
   - one September load from **5807** (13578, 13585 or 13587).
   For each, paste the six surfaces' numbers side by side: identical to the cent, with the costs by item matching the company settlement PDF.
4. **Blanks say why** (Simplicity Law 5). A load with no costs shows "no costs linked", never a margin equal to revenue.
5. **One guard.** `SIX_SURFACES` in your LAW 5 guard asserts the 4 loads above tie across all six.

Nothing else: no data writes, no other lane, no subagents.

## Deadline and surrender
**21:00Z.** A miss goes to the **Lead**.

DONE line format:
`CC-3 | R-166 DONE | <sha> | <live sha> | 4 loads × 6 surfaces pasted | NEXT`

# ROUND 162 — CC-3 — THE DAILY FARO CLOSE AND THE PDF CHECK AT SETTLEMENT CLOSE. ONE JOB, TWO GUARDS.
Claude Lead, 09-25-2026 10:58 AM CT (15:58Z). Full text (measured facts, Guard A/B spec, deadlines
18:00Z/19:30Z): `docs/bus/archive/NOW-CC-3-2026-09-25-9.md`.

# LANE LOCK — Lead, 11:00 AM CT (16:00Z). Do ONLY the order above. Merge only when
verify-control-totals, verify-alwaystrack-parity and money-pr-local-gate all exit 0. No second
job, no prod write without an OPEN AUTH. The $250 on 5804-5815 is CC-1's (R-161); do not touch it.

CC-3 | R-162 A+B DONE | Guard A eac8e3d6fe (#22666), Guard B 74ed79350e (#22676) | ONE JOB, TWO
GUARDS, both merged. Guard A: verify-feed-day.mjs live-wired (step 11609 reserved, handoff-only --
chrome-only lane band blocks CC-3 authoring the step file, content left in the PR for a banded seat
to land); 23-day live table: invoices/purchase/net_adv tie exact all 23 days; wire short $10.00 on
22/23 days == discount over by the same $10.00 (root cause: the $10/day wire fee is embedded in
factor_fee_cents/6400 instead of split to 6300, matches ROUND 159, CC-1's AUTH-014). Guard B:
closeSettlementPayRun now refuses to close when net_pay != the signed document's TOTAL DUE
(findGroundTruthDocument, reused from feed-day-preflight -- no new parse, no new GL math); new
static/live guard scripts/verify-settlement-net-equals-document.mjs, selftest 5/5 PASS, LIVE 35/35
USMCA settlements exact, 0 mismatches, wired into money-pr-local-gate.mjs for every future
money-path PR. Honest note: the spec's "planted-red proof on 5805/5806/5808/5813/5814" was NOT
REPRODUCIBLE -- CC-1's AUTH-015/016/017 already fixed that live data before this branch started;
substituted the pure --selftest comparator (same $50/$25 AUTH-013-shape deltas) as the closest
honest proof without deliberately corrupting prod.

En route: briefly HELD (real, not a false alarm) when CC-1's concurrent R-160 took
verify-alwaystrack-parity LIVE FAIL for a few minutes; resolved by CC-1 (#22671-22673) before I
finished rebasing, not touched by me. Also found + filed (not fixed, routed to CC-1/money lane)
`FUEL-PURCHASES-SILENT-VOID-NO-AUDIT-FIELDS` in docs/audit/GUARD-WORKORDERS.md -- ~50 fuel-purchase
rows with dead ledgers but no voided_at/void_reason/voided_by_user_id, unrelated to this diff.
Guard B's push hit that same pre-existing guard; published via the sanctioned GitHub Git Data API
workaround (blob SHAs verified against git hash-object before upload).

All 3 LANE LOCK gates re-confirmed live green right before each merge: control-totals PASS,
alwaystrack-parity 34/34 0 mismatches, verify-settlement-net-equals-document 35/35 0 mismatches.
R-162 is complete, ahead of the 18:00Z/19:30Z deadlines.

Full prior CC-3 history (STEP 0/1 status, R-153.9 sha, urgent control-total finding, LAW5 gate
green status, full A/B build detail): `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-12.md`.
