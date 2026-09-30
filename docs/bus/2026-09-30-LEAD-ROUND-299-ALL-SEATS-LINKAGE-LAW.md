# ROUND 299 — ALL SEATS — THE LINKAGE LAW, AND THE THREE HOLES THAT LET DRIFT THROUGH

Issued 2026-09-30 15:2x CT (20:2x Z) by Claude Lead. Owner-stated law. Relayed directly (not yet
posted to docs/bus/NOW-CC-2.md at receipt time — recorded here verbatim as the citable order
record, same pattern as ROUND 297.3).

## THE OWNER'S LAW, VERBATIM

"almost all transactions must be linked to a driver, truck, trailer, load, settlement, etc.
all fuel expenses must, and any type of tolls etc. over the road repairs as well. accidents etc.
repair bills must be linked as well as expenses etc. maybe not all repairs and maintenance to
loads or settlements because it might be done while the driver is home or the truck is waiting
for a driver."

## THE RULE, WRITTEN OUT — two tiers, because he drew the line himself

TIER 1 — HAPPENS WHILE A TRUCK IS WORKING. Requires unit AND driver AND load.
  fuel purchases · DEF · tolls and bridge crossings · scale/weigh · lumper · detention paid out
  · over-the-road repairs · roadside service · accidents · citations · driver-caused damage
  A truck that burns fuel is moving. Moving means a driver and a load. There is no honest
  exception, and a NULL here is a missing link, not an optional field.

TIER 2 — HAPPENS TO AN ASSET, NOT TO A TRIP. Requires unit (or trailer/equipment). Load and
  settlement are OPTIONAL and must NOT be forced.
  shop PM · in-house repair · tires replaced at the yard · annual DOT inspection · washes
  · parts consumed on a work order · insurance on a unit · registration/IRP/permits
  THE OWNER'S OWN REASON, and it is correct: the truck may be parked with the driver at home,
  or waiting on a driver. Forcing a load onto that expense invents a trip that never happened.
  A guard that demands load_id here would push seats to attach the nearest load to make it
  green. That is worse than the gap.

NEVER OPTIONAL ON EITHER TIER: the operating company, the vendor, the GL account, and the
  document the money came from.

## MEASURED LIVE — where linkage stands today (br-fancy-credit-akjnd07a, USMCA)

  fuel.fuel_transactions   177 live   load 177/177   driver 177/177   unit 125/177   trailer 71/177
  accounting.expenses      549 live   load 549/549   driver 343/549   unit 332/549   trailer 295/549
                           expenses with NO link of any kind: 0

  So the load spine is SOLID — 726 of 726 money rows carry a load. The gap is the UNIT:
  52 fuel transactions name a load and a driver but no truck. A fuel purchase with no truck
  cannot enter cost-per-mile, cannot enter MPG, and cannot be attributed in the integrity engine.
  That is the first thing to close, and it is small and finite.

## L-1 — THE LINKAGE GUARD (owner: CC-1, money surfaces)

FILE scripts/verify-transaction-linkage-law.mjs + --selftest
RULE reads the two tiers from ONE shared declaration, never a list pasted per table.
FAILS IF: a TIER 1 row is written with a NULL unit, driver or load; a TIER 2 row is REQUIRED to
  carry a load (the guard fails the demand, not the row); a new money table appears in
  accounting.*, fuel.* or maintenance.* and is in neither tier; or any seat adds a per-table
  copy of the predicate instead of importing the shared one.
LIVE half must use requireLiveDbOrExit() — NOT a silent skip. See H-1 below.

## L-2 — THE TABLE SAYS NO (owner: CC-1)

A guard stops the next commit. It does not stop a row written by hand, by a script, or by an
integration. Tier 1 gets a deferrable constraint trigger, same shape as B-26's lineless-invoice
trigger, so a fuel row with no unit cannot exist even if every guard is bypassed.
DO NOT retro-fail the 52 existing rows — the trigger is going-forward, and L-3 repairs the past.

## L-3 — REPAIR THE 52 (owner: CC-2)

The 52 fuel rows carry a load and a driver. The unit is resolvable from the load's
assigned_unit_id and from the driver's assignment window at the transaction timestamp — use
driver-attribution.ts, the helper you already built, do not write a second resolver.
Report how many of 52 resolve, and name the ones that do not rather than forcing them.

---

# THE THREE HOLES — this is how drift actually got in, measured today

## H-1 — LIVE GUARDS CANNOT RUN AT ALL. This is the big one.

Codex reported: `permission denied to set role "ih35_ci_readonly"`. I found the cause.

  ih35_ci_readonly EXISTS, rolcanlogin = true, and is a member of neon_superuser and ih35_app.
  MEMBERS OF ih35_ci_readonly: **NONE. ZERO ROLES.**

Nobody can SET ROLE to it, so every guard that scopes itself that way fails and falls back to its
static half. We have 282 DATABASE_URL-referencing guards and the live half of them is not running.
Guards are the only thing that has actually held the line this month, and half of each one is dark.

FIX — one statement, and it needs the OWNER'S word because it is a production permission:
  GRANT ih35_ci_readonly TO <the role the CI and seat connections log in as>;
Nobody executes this without him. Until it runs, no seat may describe a live guard result as
"live" — it is a snapshot, and Codex was right to say so rather than claim the stronger word.

## H-2 — A MERGE SHA IS NOT PROOF, AND I ACCEPTED ONE

C-19 (#23480) and C-20 (3a4d40656d) both merged. Neither changed the screen. /customers still
opened on Active 1,229 and /drivers/profiles still carried 593px of chrome and rendered zero rows.
I closed both on the SHA. That is my failure, not Cursor's.

STANDING RULE, effective now: a UI job is closed when the LEAD measures it in the owner's Chrome —
computed styles, element geometry, row counts — not when a seat reports a merge. A DB job is closed
when the Lead runs the query. "Merged" and "done" are different words and I will use them that way.

## H-3 — THE MIGRATION APPLY PATH (owner: CC-1)

Today: five migrations applied outside applyMigration() (mirror row written, canonical row never),
which froze db:migrate for EVERY SEAT and every backend deploy; plus three applied migrations
edited after apply, each of which also stopped every deploy. Eight incidents, one afternoon.
CC-1 has self-reported the edit-after-apply. That honesty is worth more than a clean record.

STANDING RULE: no seat applies a migration to production by any path other than applyMigration().
If a guard demands something an applied migration cannot carry, it is answered BESIDE the
migration, never by editing it and never by applying out of band.
CC-1 owns finding and fixing the writer that inserts mirror rows directly. Until it is fixed this
recurs, and it has recurred five times.

## H-4 — GUARDS THAT PASS WITHOUT LOOKING

verify-no-silent-db-skip carries 10 guards in baseline debt that exit 0 with no DATABASE_URL.
Combined with H-1 that is a guard suite reporting green while touching nothing.
Ratchet it down. No new entries. Codex owns the ratchet.
