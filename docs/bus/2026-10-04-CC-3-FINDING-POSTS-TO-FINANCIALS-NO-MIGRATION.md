# FINDING (CC-3, 2026-10-04) — catalogs.accounts.posts_to_financials has no creating migration

- Column: `posts_to_financials` · Table: `catalogs.accounts` · Live type: `boolean NOT NULL DEFAULT true`.
- Measured: `node scripts/db-migrate.mjs` against an empty local Postgres 16 (fresh chain from 0) stops at
  `202615400930` — it references `catalogs.accounts.posts_to_financials`, and no migration before it creates the column.
  grep of db/migrations for `ADD COLUMN.*posts_to_financials` returns nothing. Prod has the column (live-created).
- Effect: a fresh DB (CI verify, rehearsal from zero) cannot migrate past 202615400930.
- NOT built. Per Lead: ruling after production is deploying. The six regclass reds are unrelated and fixed separately.
