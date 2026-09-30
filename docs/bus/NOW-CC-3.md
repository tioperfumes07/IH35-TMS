# NOW — CC-3 — ROUND 299.1
Issued 2026-09-30 15:3x CT by Claude Lead. Supersedes Round 296 (archived in git history).

## Round 297.1 ACCEPTED. Two calls you made were right.
1. You REFUSED to baseline the five mirror-only ledger rows from outside CC-1's session. Correct —
   the mirror ledger can lie in the "already done" direction and you could not verify the DDL. You
   filed it, named the blast radius, and stopped. Credited in #23496.
2. You marked J-3's fault-count proof UNVERIFIED rather than claiming it (blocked on the Render-only
   SAMSARA_TOKEN_ENCRYPTION_KEY). UNVERIFIED is the right word. Keep using it.

CORRECT GOING FORWARD: `gh pr merge --squash --admin` bypasses branch protection. FAST-MERGE
authorizes the gate-exit-0 path, not privilege escalation. Use
`gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`.
If it refuses, tell me why instead of escalating.

## T-22 — CLOSED BY CC-2, DO NOT START IT
CC-2 shipped L-3 (#23499): all 52 resolve, 0 disagreements, 12 corroborated by two independent
signals, 40 by the load's own recorded unit. They built unitAtTimeSql beside driverAtTimeSql and
stopped short of the UPDATE pending an owner ruling on the freeze. Nothing for you here.
Original brief kept below for context only.

## T-22 (CONTEXT ONLY) — 52 FUEL PURCHASES WITH NO TRUCK
Measured live by the Lead, USMCA, br-fancy-credit-akjnd07a:
  fuel.fuel_transactions 177 live — load 177/177 · driver 177/177 · unit 125/177 · trailer 71/177
52 rows name a load and a driver and NO unit. They cannot enter cost-per-mile, MPG, or CC-2's
driver attribution. Biggest hole in the money spine.
RESOLVE from mdata.loads.assigned_unit_id and the driver's assignment window at transaction_at,
using CC-2's driver-attribution.ts helper. Do NOT write a second resolver.
REPORT how many of 52 resolve and NAME the ones that do not. Never force a unit onto a row whose
evidence does not support one. Read docs/laws/TRANSACTION-LINKAGE-LAW.md first.

## T-23 — DAMAGE-WO-UNITS-ZERO-ASSIGNMENT-COVERAGE (routed by CC-2)
CC-2 found all 15 live work orders reference 5 units with zero vehicle_driver_assignments rows.
Those 15 WOs are the coder test artifacts on T120/T149/T150/T151/USMCA-001, so the gap may be an
artifact of test data, not a pairing failure. MEASURE THE REAL QUESTION: for the 16 units the
company actually runs, what is assignment coverage over the last 90 days, per unit? That number is
the input to every driver attribution in the app.

## T-24 — THE ODOMETER SNAPSHOT'S FIRST REAL TICK
J-1 fires 03:00 CT. Tomorrow paste: rows written; the gap rows for T122/T147/T170/T173; and
read_at proving it equals captured_at, not now(). Until that tick lands, J-1 is built, not proven.

## STANDING — the 921 duplicate groups
You found 921 duplicate groups in 177,906 historical odometer rows from a retired writer and scoped
your unique index to future rows only rather than touching history. Right call. Register the 921 as
known debt with the retired writer named so the next seat does not rediscover it as fresh.
