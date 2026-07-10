# CI Split Proposal — break up `ci / build-typecheck`

Status: PROPOSAL (not implemented). Written 2026-07-10 on `chore/ci-split-and-guard-hardening`.
Companion fix shipped in the same branch: `scripts/verify-aggregate-schema-grants.mjs` comment
false-positive fix (see bottom of this doc — that part IS implemented).

## 1. What `build-typecheck` actually runs today (verified by reading the file)

`.github/workflows/ci.yml` job `build-typecheck` is a single job, single 15-minute timeout, one
`postgres:16-alpine` service container, and one linear `steps:` list of **~330 steps** run serially.
In order:

1. **`npm ci`** — install.
2. **`npm run verify:pre-commit`** (`scripts/verify-pre-commit.mjs`) — itself a mini-orchestrator
   that dynamically loads and runs **125 step files** from `scripts/verify-steps/*.mjs` in
   filename order, including (grep-verified):
   - `01-ensure-database-url.mjs`, `02-db-reset.mjs` — resets the CI Postgres DB (real DB, from here on).
   - `03-build-backend-emit.mjs` — backend `tsc` compile (COMPILE).
   - `04-frontend-tsc.mjs` — frontend `tsc` (COMPILE).
   - `10-backend-vitest.mjs` — **runs the full backend vitest suite** against the real CI Postgres,
     including every `*.db.test.ts` (44 files, grep-verified) (DB TESTS).
   - `11-frontend-vitest.mjs` — frontend unit tests (UNIT TESTS).
   - ~100 remaining `NN-verify-*.mjs` files — repo-wide static/semantic guards, several of which
     also open a DB connection (`07a-verify-schema-usage-grants.mjs`, `12a`/`12b`
     `verify-sql-write/read-targets.mjs`, `12c-verify-db-migrate-prod-guard.mjs`, at least 4 files
     grep-matched `DATABASE_URL`/`Pool(`) (GUARDS, some DB-dependent).
3. **~250 more individual `npm run verify:xxx` steps**, one per workflow `- name:`/`run:` pair,
   written directly in `ci.yml` (NOT routed through `verify-pre-commit.mjs`) — these are almost all
   static/semantic repo-wide guards (GUARDS): schema-name checks, palette/UI-contract checks,
   route-completeness checks, sidebar/nav-contract checks, GAP/CAP/FIN/CHAT/BLOCK-numbered feature
   guards, etc. A large fraction of these have nothing to do with the diff of a typical PR.
4. **`npm run test:coverage`** (`vitest run --config apps/backend/vitest.config.ts --coverage`) —
   runs the **entire backend suite a second time**, this time with coverage instrumentation. This
   duplicates step 2's `10-backend-vitest.mjs` run (DB TESTS, duplicated).
5. **`cd apps/frontend && npm run build`** — frontend production build (FRONTEND BUILD).
6. **`npm run build:driver-pwa`** — driver PWA build (FRONTEND BUILD).
7. **`npm run build`** (`tsc -p tsconfig.json && node scripts/copy-email-templates.mjs`) — backend
   build again (COMPILE, duplicates step 2's `03-build-backend-emit.mjs`).
8. **~130 more individual `npm run verify:xxx` steps** (GUARDS, same character as #3).
9. **Boot smoke tests**: `ci:boot-api-smoke`, `ci:boot-aggregate-smoke`, `smoke:accounting` — boots
   the compiled `dist/index.js` against the real DB and hits live routes (BOOT SMOKE, DB-dependent).

### Classification summary

| Category | Where | Needs real Postgres? | Approx cost driver |
|---|---|---|---|
| Compile (backend tsc) | steps 2, 7 (**run twice**) | No | CPU, duplicated |
| Compile (frontend tsc) | inside step 2 | No | CPU |
| Frontend/driver-pwa build | steps 5, 6 | No | CPU, Vite bundling |
| Unit tests (vitest, non-DB) | inside steps 2 & 4 | No | fast, high count |
| DB tests (`*.db.test.ts`, 44 files) | inside steps 2 & 4 (**run twice**) | **Yes** | shared-state flakiness (see MEMORY `shared-company-db-test-contamination`, `flaky-bank-driver-advance-test`) |
| Guards (`verify-*.mjs`, ~380 total across step 2 + steps 3/8) | steps 2, 3, 8 | Mixed — most no, ~10-15 yes | huge count, mostly static, a few DB round-trips |
| Boot smoke | step 9 | Yes | needs a built dist + seeded-ish DB |

**Root cause of the reported pain:** every PR — including a pure-docs or pure-frontend-UI PR —
pays for: 2x backend compile, 2x full DB-test suite run (with its known shared-state races), and
~380 repo-wide guard invocations that mostly assert properties of code the PR never touched. A
guard false positive (e.g. `verify-aggregate-schema-grants` reading comment prose as SQL) or a
flaky `*.db.test.ts` fails the PR for reasons having nothing to do with its diff, and there is only
ONE job (`build-typecheck`) — a single red step is a single red job, and re-running means paying the
full ~330-step, 2x-compile, 2x-test-suite cost again.

## 2. Proposed split

Replace the one `build-typecheck` job with **five parallel jobs** plus a thin **aggregator** job that
keeps the exact required-check name GitHub branch protection already trusts.

```
ci.yml (after)
├── verify-branch-fresh        (unchanged)
├── backend-compile            (NEW) — tsc backend + frontend tsc, no DB, no postgres service
├── frontend-build             (NEW) — apps/frontend build + driver-pwa build, no DB
├── unit-tests                 (NEW) — vitest run of everything EXCEPT *.db.test.ts, no DB
├── db-tests                   (NEW) — vitest run of *.db.test.ts ONLY, postgres service,
│                                       serialized (--pool=forks --poolOptions.forks.singleFork
│                                       or --maxWorkers=1) to stop the shared-company/role/flag races
│                                       documented in MEMORY `shared-company-db-test-contamination`
├── guards                     (NEW) — all ~380 verify-*.mjs steps, split into:
│                                       guards-static (no DB) and guards-db (needs postgres),
│                                       both can fan out further if still slow
└── build-typecheck            (NEW: thin aggregator)
      needs: [backend-compile, frontend-build, unit-tests, db-tests, guards-static, guards-db]
      runs: boot smoke steps (needs the dist from backend-compile + a seeded DB) then
      `echo "all sub-jobs green"` — this is the ONLY job whose reported context stays
      literally "ci / build-typecheck", so branch-protection-config.json,
      required-checks.yml's mandatory-checks list, and any live GitHub branch-protection
      rule need ZERO edits.
```

### Before (current `ci.yml`, abbreviated)

```yaml
jobs:
  verify-branch-fresh: { ... }
  build-typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services: { postgres: { ... } }
    steps:
      - checkout / setup-node / npm ci
      - npm run verify:pre-commit        # 125 steps incl. full DB vitest + compiles
      - ~250 individual verify:xxx steps
      - npm run test:coverage            # full DB vitest AGAIN
      - frontend build / driver-pwa build
      - npm run build                    # backend compile AGAIN
      - ~130 more verify:xxx steps
      - boot smoke (3 steps)
```

### After (proposed)

```yaml
jobs:
  verify-branch-fresh: { ... }            # unchanged

  backend-compile:
    runs-on: ubuntu-latest
    steps:
      - checkout / setup-node / npm ci
      - run: npx tsc -p tsconfig.json      # backend compile, once
      - run: cd apps/frontend && npx tsc -b --pretty false   # frontend tsc, once

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - checkout / setup-node / npm ci
      - run: cd apps/frontend && npm run build
      - run: npm run build:driver-pwa

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - checkout / setup-node / npm ci
      - run: npx vitest run --config apps/backend/vitest.config.ts
              --exclude '**/*.db.test.ts' --coverage

  db-tests:
    runs-on: ubuntu-latest
    services: { postgres: { ... } }        # same service block as today
    env: { DATABASE_URL: ..., DATABASE_DIRECT_URL: ... }
    steps:
      - checkout / setup-node / npm ci
      - run: node scripts/db-reset.mjs      # (or equivalent from 02-db-reset.mjs)
      - run: npx vitest run --config apps/backend/vitest.config.ts
              --include '**/*.db.test.ts' --pool=forks --poolOptions.forks.singleFork
        # serialized on purpose — see "DB-test flakiness" below; NOT fixed in this pass

  guards-static:
    runs-on: ubuntu-latest
    steps:
      - checkout / setup-node / npm ci
      - run: <every verify:xxx that does not touch DATABASE_URL — the ~370 non-DB guards,
              run as one job to avoid 370 separate job-spinup costs; can shard by npm-script
              list if this job becomes the new bottleneck>

  guards-db:
    runs-on: ubuntu-latest
    services: { postgres: { ... } }
    steps:
      - checkout / setup-node / npm ci
      - run: <the ~10-15 DB-touching guards: verify-schema-usage-grants,
              verify-sql-write-targets, verify-sql-read-targets,
              verify-db-migrate-prod-guard, verify-migration-application-consistency, ...>

  build-typecheck:                          # THIN aggregator — keeps the required-check name
    needs: [backend-compile, frontend-build, unit-tests, db-tests, guards-static, guards-db]
    runs-on: ubuntu-latest
    services: { postgres: { ... } }
    steps:
      - checkout / setup-node / npm ci
      - run: npm run build                  # produce dist/ once, for smoke
      - run: npm run ci:boot-api-smoke
      - run: npm run ci:boot-aggregate-smoke
      - run: npm run smoke:accounting
```

## 3. Path filters (proposal only — NOT implemented this pass)

GitHub Actions required-status-checks have a well-known trap: if a job is skipped via a workflow-
level `paths:`/`paths-ignore:` filter, its check **never reports**, and a branch-protection rule that
requires that context blocks the PR forever ("Expected — waiting for status to be reported"). The
`ci / build-typecheck` context is in the **mandatory hard-coded list** inside
`required-checks.yml`'s `Assert all mandatory checks present in config` step, so it can never be
allowed to silently not-run.

The safe pattern (do NOT use workflow-level `paths:` on any job in the mandatory list):
- Keep every job in the `needs:` chain of the `build-typecheck` aggregator **always triggered**.
- Inside `frontend-build` / `unit-tests` / `db-tests` / `guards-*`, use `dorny/paths-filter@v3` (or a
  plain `git diff --name-only origin/main...HEAD`) as the **first step** to compute whether the PR
  touched files relevant to that job (e.g. `db-tests` only needs to actually run the vitest command
  if `apps/backend/src/**` or `db/migrations/**` changed; a docs-only PR's `db-tests` job would still
  execute and report **success** in ~10s via a no-op branch, never skip).
- This preserves "required check always reports" while cutting real work for irrelevant diffs.
- `backend-compile` and `guards-static` should probably NOT be path-filtered at all — they're cheap
  enough, and repo-wide guards are correctness assertions about the *whole* repo state (a docs PR can
  still be built on top of a repo that's newly broken by a sibling PR that merged first — see
  `docs/trackers` MEMORY note `reconcile-blocks-done-is-merge-not-verified` on trusting merged ≠
  verified).

This is deliberately left as a documented plan, not code, because getting the "always report,
conditionally skip work" pattern wrong is exactly the failure mode that would produce permanently
stuck PRs — higher blast radius than the current pain, so it needs a dedicated block + live
verification (open a throwaway PR, confirm the required check reports on both a path-included and
path-excluded diff) before it ships.

## 4. `db-tests` flakiness — documented, NOT fixed in this pass

44 `*.db.test.ts` files currently share CI's single Postgres service container and, per MEMORY
`shared-company-db-test-contamination`, race on one company/role/flag slot when vitest parallelizes
workers. Splitting them into their own job does not fix the race — it isolates the blast radius
(a `db-tests` failure no longer also reports as a `backend-compile` or `guards-static` failure) and
makes it easy to force `--pool=forks --poolOptions.forks.singleFork` (or `--maxWorkers=1`) on just
this job without slowing down the now-separate `unit-tests` job. The actual per-test fix (scope each
test's fixtures to its own company id, per `MEMORY.md`) is a separate block.

## 5. `required-checks-gate` implications — verified

- `required-checks.yml`'s `Assert all mandatory checks present in config` step hard-codes 8 required
  context strings, including `ci / build-typecheck` (exact string). As long as the aggregator job in
  `ci.yml` keeps the YAML key `build-typecheck`, the reported GitHub context stays `ci /
  build-typecheck` and **`.github/branch-protection-config.json` needs zero changes.**
- If instead the new parallel jobs were each added to the *required* list (e.g. requiring
  `ci / db-tests` directly rather than folding it under the `build-typecheck` aggregator via
  `needs:`), that would require: (1) editing `branch-protection-config.json`'s
  `required_status_checks.contexts` array, (2) editing the hard-coded `mandatory` array in
  `required-checks.yml`, (3) the `CI guard — verify CI policy applied`
  (`scripts/verify-ci-policy-applied.mjs`) step actually pushing that config to live GitHub branch
  protection (it uses `GH_ADMIN_TOKEN`) — three coordinated changes that must land together or the
  gate goes red for everyone. **Recommendation: use the thin-aggregator `needs:` pattern instead so
  none of that is required.**

## 6. What this pass actually implemented vs. only proposed

**Implemented** (see `scripts/verify-aggregate-schema-grants.mjs`, same branch):
- Fixed the false-positive class where the `FROM`/`JOIN` schema-name regex matched prose inside
  `//` line comments and `/* */` block comments (e.g. `// Downloaded from R2.` was read as SQL
  referencing a schema `r2`). Matches inside comments are now dropped. Real `FROM`/`JOIN schema.`
  usage in actual code is still fully detected — proved by an injected negative-control file
  referencing a genuinely ungranted fake schema (`zz_totally_fake_ungranted_schema`), which the
  guard correctly failed on before being removed.
- Added `--selftest` (4 checks: line-comment ignored, block-comment ignored, real SQL still detected,
  `hasSchemaGrant()` still fails an ungranted schema / passes a granted one).

**Only proposed** (this document): the job split, the DB-test isolation via `--pool=forks
--poolOptions.forks.singleFork`, and any path filtering. None of `ci.yml` was changed in this pass —
splitting a ~330-step required job is itself a financial-blast-radius change (it gates every merge to
`main`, including financial-cluster PRs) and per repo policy deserves its own branch, its own CI-green
proof, and Jorge's review before merge, even though the workflow YAML itself is non-financial.
