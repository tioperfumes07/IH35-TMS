# Incident + fix: a HELD migration executed on PROD (2026-07-12)

## What happened
`#2396`'s migration `db/migrations/202607280000_relay_deposit_classifier.sql` — explicitly marked
**"DO NOT MERGE. DO NOT RUN ON PROD."** and registered in `db/migrations/.held-migrations.json` — was
executed against the **production** database. GUARD confirmed both tables it creates now exist on prod:
`integrations.relay_deposits` and `integrations.relay_company_cards` (and the seed ran). It is a
display-only classifier (nothing posts to the GL), so no financial harm — but a held migration reaching
prod at all is a safety-control failure.

## Root cause — `.held-migrations.json` never blocked execution
The hold mechanism had **two** parts, only one of which actually existed in code:

1. **Marker↔registry parity (existed):** `scripts/verify-hold-migrations-registered.mjs` enforces that
   every "DO NOT RUN ON PROD" migration is registered in `.held-migrations.json` and keeps its marker.
   This is a *documentation-integrity* guard. It proves a held migration stays labelled — it does **not**
   stop it from running.

2. **Execution block (did NOT exist):** The registry's own note says a held migration must "run ONLY on a
   Neon branch by Jorge's hand, then be ledger-backfilled so prod `db:migrate` skips it." That was a
   **manual, out-of-band** step. **Nothing in `scripts/db-migrate.mjs` consulted `.held-migrations.json`.**
   The runner simply applied every disk migration not already in the ledger.

So the protection depended on a human remembering to (a) run the migration on a Neon branch and (b)
backfill the prod ledger *before* the next prod deploy. If that didn't happen, the deploy's
`preDeployCommand: npm run db:migrate` (render.yaml) saw the held migration as **pending** (absent from the
prod ledger, never backfilled) and **applied it on prod**. That is exactly what happened to #2396.

## How #2396 passed the `hold-merge-gate`
The `hold-merge-gate` is a **merge** gate, not a runtime execution barrier. Its job is to red-line any
financial / migration PR until the owner approves it (the `JORGE-APPROVED` label). #2396 was legitimately
`JORGE-APPROVED` (the owner approved merging the display-only classifier), so the gate **correctly passed**
and the PR merged — the gate did exactly what it is designed to do.

The latent flaw is that **"approved to merge into main" silently equalled "will execute on prod"**, because
the deploy-time migration runner had no hold-awareness. The gate was never designed to prevent a held
migration from executing *after* merge; the missing control was runtime hold-awareness in the runner.
Nothing was broken in the gate — the gate simply isn't the layer that keeps a held migration off prod.

## The fix — the runner now refuses to execute held migrations on prod
`scripts/db-migrate.mjs` now loads `db/migrations/.held-migrations.json` and, when running against
production (`TARGET_IS_PROD`, or any run with `ALLOW_PROD_MIGRATE=1` — the signal the Render deploy sets),
**records each held migration in both ledgers WITHOUT executing a single statement of its DDL** (a
`HOLD-SKIP` branch; the ledger row carries `applied_by = 'held-skip:not-executed-on-prod'`). Recording it
in the ledger keeps the runtime startup drift guard satisfied (the app boots) while the DDL never touches
prod. On non-prod targets (fresh CI DB, local, a Neon dev branch) held migrations still apply normally, so
schema-parity / content-verify are unchanged.

This automates the intended "ledger-backfill so prod skips it" step and makes it **tamper-proof**: it no
longer depends on anyone remembering to backfill before a deploy.

### To land a held migration on prod for real (owner ceremony)
Un-hold it deliberately: remove its entry from `.held-migrations.json` (and drop its DO-NOT-RUN marker) in
a follow-up PR. It then becomes a normal pending migration and the next deploy applies it. That un-hold is
an explicit, auditable owner decision — not an accident of the deploy pipeline.

## New regression guard
`scripts/verify-held-migrations-not-runnable.mjs` (registered in `verify:arch-design` + `locked-guards.yml`,
with `--selftest`) statically proves the runtime block stays wired: the registry is present and non-empty,
`db-migrate.mjs` loads it and has the prod-gated `HOLD-SKIP` branch that ledger-records **without** running
DDL, and `render.yaml`'s preDeploy uses `npm run db:migrate`. Its `--selftest` deletes the block from a copy
of the runner and asserts the guard catches it.

## Verification (local Postgres 16, full 661-migration chain from 0001)
- **Non-prod run:** all 661 apply; `202607280000_relay_deposit_classifier.sql` → `APPLY`;
  `integrations.relay_deposits` + `relay_company_cards` **exist**.
- **Prod-simulated run** (`ALLOW_PROD_MIGRATE=1`): 53 held migrations → `HOLD-SKIP`;
  `integrations.relay_deposits` **absent**; `mdata.loads` (normal) present; completes successfully; ledger
  row `applied_by = held-skip:not-executed-on-prod`.
- **Drift-guard invariant:** disk = `_system._schema_migrations` = `ih35_migrations.applied_migrations` =
  661 → the runtime startup drift guard passes, so prod still boots.
- **Idempotent:** a second prod-sim run is 0 apply / 0 hold-skip, clean.
- No held migration turned out to be a dependency of any normal migration (the full chain completed with all
  53 held skipped), so skipping them on prod does not break later migrations.

## Note on #2396's already-created tables
This fix is forward-looking: it prevents future held migrations from reaching prod. #2396's tables already
exist on prod (created before this fix). They are empty/inert display-only tables with nothing posted;
whether to keep or roll them back is an owner decision and is out of scope for this safety fix.
