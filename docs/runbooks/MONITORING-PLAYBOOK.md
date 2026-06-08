# Monitoring Playbook — IH35 TMS

**Block:** CLOSURE-21-MONITORING-SETUP  
**Owner:** Jorge (on-call)  
**Updated:** 2026-06-05

## Dashboards

| System | URL / access | Purpose |
|--------|--------------|---------|
| Sentry (backend) | Render env `SENTRY_DSN` → Sentry project **ih35-backend** | Unhandled exceptions, slow queries (>2s), traces |
| Sentry (office SPA) | `VITE_SENTRY_DSN` → project **ih35-frontend** | React ErrorBoundary + breadcrumbs |
| Sentry (driver PWA) | `VITE_SENTRY_DSN` on driver service → **ih35-driver-pwa** | Driver app crashes |
| Render | https://dashboard.render.com | CPU/RAM, deploy status, log stream |
| Uptime | Better Uptime / UptimeRobot (see `scripts/uptime-monitor-config.mjs`) | `/api/v1/health`, `/api/v1/health/deep`, `app.ih35dispatch.com` |

## Structured logs

Backend routes should migrate to `createStructuredLogger()` (`apps/backend/src/observability/structured-logger.ts`).

Each line is JSON with: `timestamp`, `level`, `message`, `request_id`, `user_id`, `company_id`, `route`, `latency_ms`, `error_stack`.

Render log drain captures stdout automatically. Filter in Render logs: `"level":"error"`.

## Deep health check

`GET /api/v1/health/deep` (module: `observability/health-deep.routes.ts`) returns **200** only when all pass:

- **database** — `SELECT 1 FROM org.companies LIMIT 1`
- **qbo** — last completed sync < 1h
- **samsara** — API token configured + vehicles endpoint 200
- **plaid** — active item `last_synced_at` < 24h

Returns **503** with `failed: [...]` when any dependency is down.

## Common error patterns

| Pattern | Likely cause | Remediation |
|---------|--------------|-------------|
| `migration_ledger_missing` | DB migrate not applied | Run `npm run db:migrate` on Render pre-deploy |
| `stale_sync_*` (QBO) | QBO worker stalled | Check `qbo.sync_runs`, restart worker cron |
| `login_required` (Plaid) | Bank re-link needed | Owner re-authenticates Plaid in Banking UI |
| `503` on `/health/deep` samsara | Token revoked / API outage | Verify `SAMSARA_API_TOKEN` in Render |
| Spike in `slow_query` Sentry | Reports/accounting heavy SQL | Check `EXPLAIN` on outlier routes |

## Escalation

See [INCIDENT-RESPONSE.md](./INCIDENT-RESPONSE.md).

## Operational tuning

All tunable parameters (cron schedules, rate limits, retries, timeouts, cache TTLs, batch sizes, alert thresholds) are cataloged in [operational-tuning-catalog.md](./operational-tuning-catalog.md). Update that doc whenever changing an operational default.

## CI guard

`node scripts/verify-sentry-receives-test-error.mjs` — validates Sentry wiring when `SENTRY_DSN` + `SENTRY_AUTH_TOKEN` are set in CI.

`npm run verify:operational-tuning-catalog` — BLOCK-13 guard: catalog has ≥30 entries with all required fields and UI links.
