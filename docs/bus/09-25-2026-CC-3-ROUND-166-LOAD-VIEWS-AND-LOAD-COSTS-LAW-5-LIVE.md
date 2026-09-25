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
