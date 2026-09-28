# ROUND 177 CC-2 JOB 1 — driver pay engine cross-check FAILED. Stopped per the Lead's own law.

Instruction: "FIRST run it against 13631 ($644.64) and 13634 ($656.64) — if it cannot reproduce
those two, STOP and report. Do not write 14 bills off an engine that cannot reproduce the 2."
It cannot. Stopping here, no bills written for any of the 14. Mid tier, by hand, no forks.
Queries below are pasted as run. USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`, Neon
`tiny-field-89581227`, `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls='lucia';`.

## The engine, identified

`ensureDriverBillArtifactsForLoad()` → `createDriverBillArtifacts()` → `resolveDriverBasePayCents()`,
all in `apps/backend/src/dispatch/book-load.service.ts`. Formula per the owner's own MILES SPEC
comment in that file: `gross = (miles_shortest × rate_loaded) + (miles_deadhead × rate_empty) +
stop_bonuses + tarp + driver_lumper`. This is the same engine that minted the two reference bills —
confirmed not a second, competing engine.

## Cross-check: reproduce 13631 and 13634 from CURRENT inputs

```sql
SELECT load_number, miles_shortest, miles_practical, miles_deadhead, deadhead_miles_to_pickup,
       driver_pay_rate_per_mile
FROM mdata.loads
WHERE load_number IN ('13631','13634') AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
```
| load | miles_shortest (now) | miles_deadhead (now) | deadhead_miles_to_pickup (now) |
|---|---:|---:|---:|
| 13631 | 1347.2 | NULL | NULL |
| 13634 | 1358.6 | NULL | 115 |

```sql
SELECT load_number, gross_amount_cents, miles_basis, rate_per_mile_cents, deadhead_pay_cents,
       miles_deadhead
FROM driver_finance.driver_bills
WHERE load_id IN (SELECT id FROM mdata.loads WHERE load_number IN ('13631','13634')
                     AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80')
  AND status <> 'void';
```
| load | bill gross | `miles_basis` snapshotted at mint time | rate | deadhead paid |
|---|---:|---:|---:|---:|
| 13631 | $644.64 | **1343.0** mi | $0.48/mi | $0.00 |
| 13634 | $656.64 | **1368.0** mi | $0.48/mi | $0.00 |

`driver_bills.miles_basis` is the exact miles the engine actually used when it minted each bill —
a real, stored snapshot, not something I'm inferring. **It does not match the load's current
`miles_shortest`**:

- **13631**: minted on 1343.0 mi, `mdata.loads.miles_shortest` is now 1347.2 mi (+4.2 mi drift).
  Re-running the engine today: 1347.2 × $0.48 = **$646.66**, not $644.64.
- **13634**: minted on 1368.0 mi, `mdata.loads.miles_shortest` is now 1358.6 mi (−9.4 mi drift).
  Re-running today: 1358.6 × $0.48 = **$652.13**, not $656.64.

**Neither reproduces.** This is not the engine computing wrong — the formula and rate are exactly
what minted the originals. The *input* moved: `miles_shortest` was recalculated (Round 174's
Google-shortest-miles project) after these two bills were minted, and nothing re-ran the bills to
match. Per the Lead's own instruction, that is exactly the "stop and report" case, not a "fix the
engine and proceed" case.

## Second, separate finding: the engine cannot see the deadhead Round 174 just populated

The pay formula reads `mdata.loads.miles_deadhead`. Round 174 populated a **different** column,
`deadhead_miles_to_pickup` (confirmed live above: 13634 has 115 mi there, `miles_deadhead` is
still NULL). Grepped the full backend for any writer that copies `deadhead_miles_to_pickup` into
`miles_deadhead`: **none exists** — they are two separate columns serving two separate subsystems
(`miles_deadhead` feeds driver pay; `deadhead_miles_to_pickup` feeds the dispatch deadhead
optimizer / fleet reporting, per `db/migrations/0308_deadhead_optimization.sql`). So even on the
4 true tour legs where Round 174 gave us a real, Google-verified deadhead figure, the pay engine
as it stands today would still price deadhead as $0 — not because deadhead is genuinely zero, but
because the two columns never talk to each other. This is a real, load-bearing linkage gap, not a
guess: independently confirmed via both a live DB check and a full-codebase grep, converging on
the same answer.

## What this means for the 14 loads

I have not written a single driver bill. Per the instruction: an engine that can't reproduce the
2 known-good bills does not get run against the other 14 on my own authority. Two things need a
decision before JOB 1 can proceed safely:

1. **Which miles are correct for driver pay — the value at time of booking, or Round 174's
   freshly-recalculated `miles_shortest`?** If Round 174's numbers are the intended new
   correct baseline, the 2 reference bills are themselves now stale and may need re-minting too
   (not just the 14) — that changes the scope of "reproduce the 2" itself.
2. **Whether `miles_deadhead` should be backfilled from `deadhead_miles_to_pickup`** on the 4 true
   tour legs before the engine runs, or whether the engine itself needs to read the newer column.
   Doing this silently (guessing which is "right") would be exactly the kind of coercion the
   instruction explicitly forbids ("null means from live position, not zero — do not coerce").

Reporting both, not choosing either. Nothing fabricated, nothing written.

— CC-2, tier: mid (Sonnet-class) — this was SQL + code reading, not a root-cause hunt from a blank
slate (the two candidate columns and the drift were both directly measurable) and not money-moving
logic (no bill was created).
