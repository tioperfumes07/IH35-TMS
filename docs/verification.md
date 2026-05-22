# Verification Infrastructure

`DS-REMEDIATE-PROCESS-1` introduces a single verification command shared by local development and CI:

- `npm run verify:pre-commit`

## What It Runs

The command runs fail-fast in this order:

1. Ensure `DATABASE_URL` is available (start local verify DB if needed).
2. Reset verify DB (drop/recreate + apply all migrations).
3. Backend build emit (`npm run build:backend`).
4. Frontend typecheck (`npx tsc -b` in `apps/frontend`).
5. Architectural verification (`npm run verify:arch-design`).
6. Scheduler tenant-context verification.
7. Canonical schema name verification.
8. Backend vitest with JSON output + migration-test skip detector.
9. Frontend vitest smoke.
10. Summary report.

## Exit Codes

- `0` all checks passed.
- `1` any check failed, or any `*.migration.test.ts` test was skipped.
- `2` docker/database setup failure.

## Local Verify Database

Local verify DB runs via:

- `npm run verify:db:start`
- `npm run verify:db:stop`
- `npm run verify:db:reset`

The verify DB uses `postgres:16-alpine` from `docker-compose.verify.yml`, exposed at `localhost:54329`.

`verify:db:reset` is intentionally safety-locked. It refuses to run unless `DATABASE_URL` points at:

- `localhost:54329`
- database name `ih35_verify`

This prevents accidental destructive operations against non-verify databases.
