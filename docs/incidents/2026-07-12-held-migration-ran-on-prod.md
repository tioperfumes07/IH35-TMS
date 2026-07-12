# Incident + fix: a HELD migration executed on PROD (2026-07-12)

## What happened
`#2396`'s migration `db/migrations/202607280000_relay_deposit_classifier.sql` — explicitly marked
**"DO NOT RUN ON PROD"** and registered in `db/migrations/.held-migrations.json` — was executed against
the **production** database. GUARD confirmed both tables it creates now exist on prod:
`integrations.relay_deposits` and `integrations.relay_company_cards` (and the seed ran). It is a
display-only classifier (nothing posts to the GL), so no financial harm — but a held migration reaching
prod at all is a safety-control failure.

## Root cause — `.held-migrations.json` never blocked execution
The hold mechanism had **two** parts, only one of which existed in code:

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

## The fix — the runner refuses to execute held migrations on prod
`scripts/db-migrate.mjs` now loads `db/migrations/.held-migrations.json` (via
`scripts/lib/held-migrations.mjs`) and, before applying any pending migration, consults the pure decision
`shouldSkipHeldOnProd({ file, heldSet, isProd: TARGET_IS_PROD, allowHeldProdMigrate })`:

- **Held + target is prod + no ceremony flag → `HELD-SKIP`.** The migration's DDL is **not executed** and it
  is **not** written to the ledger — it stays honestly *pending* on prod until the owner applies it
  deliberately. (The runtime startup drift guard only validates legacy 4-digit filenames, so a pending
  12-digit held migration does not affect app boot.)
- **Held + NOT prod (fresh CI DB, local, a Neon dev branch) → apply** normally, so schema-parity /
  content-verify and the owner's hand-apply ceremony are unchanged.
- **Held + prod + explicit ceremony flag → apply.**

### The ceremony flag is DEDICATED — not `ALLOW_PROD_MIGRATE`
To apply a held migration against prod on purpose, set **`ALLOW_HELD_PROD_MIGRATE=1`**. This is deliberately
a **separate** flag from `ALLOW_PROD_MIGRATE`: the Render prod deploy already sets `ALLOW_PROD_MIGRATE=1`
(without it the pre-existing prod-migrate safety guard refuses every deploy migration), so keying the
held-skip off `ALLOW_PROD_MIGRATE` would mean held migrations are **never** skipped on a normal deploy —
defeating the control. Because the skip does **not** ledger, the migration remains applyable later via the
flag (a ledger-recorded skip would mark it "applied" and block a future deliberate apply).

## New regression guard
`scripts/verify-held-migrations-not-runnable.mjs` (registered in `verify:arch-design` +
`locked-guards.yml`, with `--selftest`) proves the runtime block stays wired and cannot silently regress:
the registry is present/non-empty and all registered files exist; `db-migrate.mjs` imports and CALLS
`shouldSkipHeldOnProd(...)` in its apply loop, gated on `TARGET_IS_PROD`, with a `continue` (skip, no
ledger); and `render.yaml`'s preDeploy runs `npm run db:migrate` so the guarded runner IS the deploy path.
The `--selftest` exercises the pure decision across all four cases.

## Verification (this session)
- Guard `--selftest`: 5/5 (held+prod→skip · held+prod+ceremony→apply · held+non-prod→apply · not-held→apply ×2).
- Decision-loop simulation over the real 661-file migration list + 53-entry held registry (same imported
  functions the runner uses): on prod **53 skip** (incl. the #2396 relay file), **0 apply-leak**; non-prod
  **0 skip**; ceremony flag **0 skip**.
- `verify-migration-runner-hardening` 18/18, `verify-migration-filenames` OK,
  `verify-hold-migrations-registered` OK, `node --check scripts/db-migrate.mjs` clean.

## Note on #2396's already-created tables
This fix is forward-looking: it prevents future held migrations from reaching prod. #2396's tables already
exist on prod (created before this fix). They are empty/inert display-only tables with nothing posted;
whether to keep or roll them back is an owner decision and is out of scope for this safety fix.
