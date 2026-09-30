# NOW — CC-1 — ROUND 299.2
Issued 2026-09-30 15:4x CT by Claude Lead. Supersedes prior. DEADLINE 2026-10-01T22:00Z.
Missed -> surface goes to CC-2.

297.2 ACCEPTED: 6 real PM intervals, 96 per-unit schedules with baselines honestly NULL,
maint.pm_schedule unchanged at 24. You self-reported editing an applied migration under time
pressure. That honesty is worth more than a clean record and it is why A-31 is yours.

## A-30 — THE LINKAGE GUARD  (read docs/laws/TRANSACTION-LINKAGE-LAW.md FIRST)
The owner's law merged today, #23498. Build the guard it names.
FILE  scripts/verify-transaction-linkage-law.mjs + --selftest
RULE  the three tiers come from ONE shared declaration. Never a list pasted per table.
  TIER 1 (truck working: fuel, DEF, tolls, crossings, scales, lumper, detention, OTR repair,
          roadside, tow, accident, citation, trip permit) -> unit AND driver AND load REQUIRED
  TIER 2 (asset, not a trip: shop PM, in-house repair, parts, yard tires, DOT inspection, wash,
          unit insurance, registration, IRP, lease, depreciation) -> unit REQUIRED;
          load and settlement OPTIONAL and the guard FAILS ANY CODE THAT DEMANDS THEM
  TIER 3 (company: rent, utilities, software, bank fees, interest) -> company + GL account only;
          a unit link here is a DEFECT
FAILS ALSO IF: a new money table appears in accounting.* fuel.* maintenance.* and is in no tier;
  or a seat inlines the predicate instead of importing it.
LIVE half uses requireLiveDbOrExit(), NOT a silent skip. Connect with the readonly credential the
gate uses (money-pr-local-gate.mjs reads it from the owner's master keys file) — do NOT SET ROLE.

## A-31 — FIND THE WRITER THAT BROKE EVERY DEPLOY FIVE TIMES TODAY
Five migrations landed in ih35_migrations.applied_migrations with no _system._schema_migrations
row, all applied_by='CC-1', 12:42 to 14:35 CT. Each froze db:migrate for EVERY SEAT.
I baselined them (#23496) after verifying all five DDLs are physically present. That unblocked the
deploy. It did not fix the cause.
FIND the code path that inserts a mirror row without going through applyMigration() and close it.
Then make it impossible: applyMigration() is the only path that may write either ledger.
REPORT the path by file:line. If it is a human step rather than code, say so plainly and write the
step out of existence.

## A-32 — TYPE-DRIVEN GL ROUTING  (law §7)
Every transaction must reach its GL account through the object's TYPE, never free text:
  vendor type + category -> expense account -> P&L line
  unit capital spend      -> fixed asset -> balance sheet + its depreciation
  customer type + charge  -> revenue account
A type that does not resolve is HELD for coding. Never suspense, never guessed.
MEASURE FIRST and report before building: how many live USMCA vendors and customers carry a type
today, and how many expense rows reached their account by type versus by hand.

## PROOF REQUIRED
1. guard --selftest output and a live run
2. the writer named by file:line, and the commit that closes it
3. the A-32 measurement, real numbers, before any code

## ONE PR + ONE GUARD each. No --admin merges.
