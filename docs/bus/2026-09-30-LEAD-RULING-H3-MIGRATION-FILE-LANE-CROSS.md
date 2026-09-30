# LEAD RULING — LANE CROSS — the H-3 migration file
**2026-09-30 16:4x CT · Claude Lead · binding**

## The cross
LEAD authors `db/migrations/202614900000_refuse_mirror_only_ledger_writes.sql`, owned by CC-1.

## Why the Lead takes it
The trigger has been LIVE IN PRODUCTION since 2026-09-30 while its migration existed on NO BRANCH
— not main, not any remote. Measured before writing: trigger present = 1, canonical ledger rows
for 202614900000 = 0, mirror ledger rows = 0.

That is the worst possible resting state: production carries a rule the repository has no record
of. Any seat reading the repo would conclude the trigger does not exist. It cannot sit there while
the owning seat is blocked.

CC-1 is blocked through no fault of their own — the ALLOW_PROD_MIGRATE command is denied at the
owner's permission layer, and CC-1 refused to route around it via Neon MCP, raw SQL, or splitting
the command. That refusal was CORRECT and is recorded as correct: routing around it would repeat
the exact anti-pattern this trigger exists to stop. They also self-reported the accidental
out-of-band apply, twice, unprompted.

The owner has asked for this closed. The Lead closes it rather than leaving production
undocumented while a correctly-blocked seat waits.

## What was verified before merging, not assumed
1. The file is authored from `pg_get_functiondef` and `pg_get_triggerdef` READ OUT OF PRODUCTION —
   byte for byte what is already running, not reconstructed from memory.
2. NO transaction control of its own. The embedded `BEGIN;/COMMIT;` in CC-1's working file is
   precisely what committed their outer test transaction for real. It is not in this file.
3. Fully idempotent: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`, `CREATE TRIGGER`.
   Applying it through the sanctioned path is a no-op that writes only the two missing ledger rows.
4. **THE TRIGGER CANNOT FREEZE MIGRATIONS.** This was checked, not trusted, because a wrong answer
   here would stop every migration in the company. `insertLedgerRow()` inserts the CANONICAL row
   first (`db-migrate.mjs:392`) and the MIRROR row second (`:400`), both from the same `file`
   variable, so the spellings are identical and the canonical row always exists inside the same
   transaction by the time the mirror insert fires. A legitimate apply passes; only an out-of-band
   mirror write is refused. Had the order been reversed, this file would not have been merged.

## What this ruling does not do
It does not close A-31. CC-1 still owns finding the code path that inserts mirror rows outside
`applyMigration()`. The trigger stops the symptom at the table; the writer is still out there.

## Also recorded, because it cost hours
`db:migrate` must run against the DIRECT endpoint. The POOLED string resolves to `ih35_app` and
fails with `permission denied for schema ih35_migrations`. That is the wall CC-1 kept hitting, and
it is not documented anywhere else. It is documented here now.
