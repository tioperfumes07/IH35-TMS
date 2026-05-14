# IH35 — Disaster recovery & rollback runbook

**Scope:** IH35 TMS on Render (API + optional workers) + Neon Postgres + Cloudflare (DNS) + object storage (R2) where enabled.

**Audience:** On-call owner/dispatcher with shell access and dashboard rights to Neon + Render.

## 1. Identify the incident

| Symptom | Likely layer | First check |
| --- | --- | --- |
| 5xx from API | Render deploy / app crash | Render logs, health endpoint |
| DB errors / timeouts | Neon / pool / migration | Neon console query stats, connection string |
| 403/401 for all users | Auth / cookies / env drift | API env (`SESSION_*`, `COOKIE_*`, OAuth client IDs) |
| Frontend blank / assets 404 | Wrong static deploy / CDN | Browser devtools network, Render static URL |

## 2. Credentials & env (no secrets in this doc)

Confirm locally (or in team vault) you can access:

- **Neon:** project → branches → connection string (`DATABASE_URL` / `DATABASE_DIRECT_URL`).
- **Render:** API service → **Environment** tab (compare to last known good backup or prior release notes).
- **Google OAuth** client IDs must match the deployed frontend URL (office app).

**Action:** For any env change, update Render env, **save**, then **Manual Deploy** the known-good commit if needed.

## 3. Freeze writes (optional, incident-specific)

For suspected data corruption:

1. Put API in maintenance mode **only if** you have a documented flag or worker pause path (otherwise skip).
2. Snapshot current state (Neon branch PITR / see §4) before destructive fixes.

## 4. Neon — point-in-time recovery (PITR)

Neon retains restore points per plan. **Do not overwrite prod branch without a new branch first.**

1. Open Neon console → your **production project**.
2. Open **Branches** → identify the **production** branch.
3. Use **Restore** / **Create branch from history** (UI may show “restore to time”) to a timestamp **before** the incident window.
4. Name the branch e.g. `recovery-YYYYMMDD-hhmm`.
5. **Validate** on the recovery branch:
   - Run read-only smoke: `SELECT 1`; spot-check critical tables (`org.companies`, recent load counts).
6. **Swap connection string** (Render `DATABASE_URL`):
   - Prefer a controlled maintenance window.
   - Point API to the recovery branch connection string; redeploy or restart the service.
7. **Retention:** Keep the old branch until ops sign-off, then delete per policy.

> If PITR is unavailable, restore from the latest logical backup (Neon export / `pg_dump` cadence — record the real backup job in `DEPLOYMENT_NOTES.md`).

## 5. Render — rollback application

1. Render dashboard → **API service** → **Events** / **Deploys**.
2. Identify last **green** deploy commit SHA (before regression).
3. **Manual Deploy** → select that commit on `main` (or redeploy from branch).
4. **Follow-through:**
   - Re-verify env vars (migrations may have run forward only — pair with §4 if schema mismatch).
   - Hit `/health` (or equivalent) and a read-only API smoke.
5. Roll back **workers / cron** services to the **same** commit if they share schema assumptions.

## 6. Frontend (office) — static deploy

If the office app is a Render static site or bundled with an API release:

- Re-deploy the **same git SHA** as the API after rollback, or redeploy the last known good **build artifact**.
- Confirm `VITE_*` / public env aligns with the API origin.

## 7. Post-incident verification (minimum)

From repo:

```bash
npm run verify:arch-design
npm test
npm run build
cd apps/frontend && npx tsc -b
```

Optional smoke (records results even when auth is limited):

```bash
cd apps/frontend && npx playwright test --config=playwright-iphone.config.ts || true
```

## 8. Communications

- Post status: time window, customer impact, mitigations, ETA.
- Log root cause and follow-up tickets in `docs/trackers/phase-7.md`.

## Recent incidents

### Cycle 6 — deploy outage (May 2026) — learning summary

During the **cycle 6 release window**, production briefly returned errors after a deploy that combined a **forward-only database migration** with an **API build** that assumed the new schema, while a **frontend bundle** from an earlier step still targeted the previous API contract. Users saw intermittent **500s** and **failed logins** until the team **rolled Render back** to the last healthy deploy and **paused follow-up migrations** on the main branch. Service was restored by aligning **API, worker, and static asset** versions on a single commit, then re-applying the migration in a **narrow maintenance window** after validating against staging. **What we would do differently:** use a **single release checklist** (migration status + API + frontend SHA + env diff), add **/health** alerting on Render, and create a **Neon restore branch** before each risky migration so PITR swap is routine instead of improvised.
