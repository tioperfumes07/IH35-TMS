# DR backup drill — 2026-05-14 (Block H — P7-BACKUP-DRILL)

This note records the **Block H backup / restore validation procedure** for IH35-TMS.

## Scope

- Commands:
  - `npm run db:backup`
  - `npm run db:restore-check`

## Environment

- Requires `DATABASE_URL` / `DATABASE_DIRECT_URL` (and any encryption/upload targets configured by `apps/backend/scripts/db-backup.ts`).
- For staging drills, point env vars at the staging Neon branch / Render Postgres instance **without** mutating production secrets in-repo.

## Drill execution (staging / Neon branch)

1. Capture pre-run sanity:
   - Record approximate row counts for high-signal tables you expect round-trip fidelity on (example probes):
     - `SELECT COUNT(*) FROM org.companies;`
     - `SELECT COUNT(*) FROM identity.users;`
     - `SELECT COUNT(*) FROM mdata.loads;`
2. Run `npm run db:backup`
   - Confirm the script completes successfully and emits an artifact reference (local path, object storage key, etc.).
3. Run `npm run db:restore-check`
   - Confirm the verification harness completes without errors.
4. Post-run validation:
   - Re-query the same COUNT probes against the restored target (per script documentation) and confirm **exact match** with pre-run counts.

## Results (agent automation record)

> Automated execution from this repository snapshot **did not run against a live staging database** from this environment (no durable `DATABASE_URL` available in the agent sandbox). Treat the checklist above as the authoritative drill steps.

| Step           | Status / notes                                      |
|----------------|-----------------------------------------------------|
| `db:backup`    | Not executed here — requires configured DB + backup sink |
| `db:restore-check` | Not executed here — requires backup artifact path |
| Row-count match | Pending manual/staging run                         |

## Operator sign-off

- Recommended: paste Neon branch name + artifact id + count probes into the PR thread when completing the drill in staging/prod-like env.
