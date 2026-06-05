# Disaster Recovery — IH35 TMS

**Block:** CLOSURE-23-DR-BACKUP-AUDIT  
**Owner:** Jorge  
**Updated:** 2026-06-05

## Objectives

| Metric | Target | Mechanism |
|--------|--------|-----------|
| **RPO** | 5 minutes | Neon continuous PITR |
| **RTO** | 30 minutes | Neon branch + Render env update |

**Neon project:** `IH35-TMS` (`tiny-field-89581227`) · **PITR:** 7 days · **Branch:** `production`

## Scenario A — Single deploy failure
Rollback via Render dashboard → verify `/api/v1/health` + `/api/v1/health/deep`.

## Scenario B — Database corruption
Stop writes → Neon PITR branch → update `DATABASE_URL` on Render → redeploy.

## Scenario C — Render outage
Failover Render service in alternate region; Neon unchanged.

## Scenario D — Cloudflare outage
Bypass CDN; point DNS to Render origin.

## Scenario E — GitHub outage
Render manual deploy from last good commit SHA.

## Scenario F — Total Neon outage
Restore from monthly checksum + off-site backup to Supabase/RDS; run migrations.

See [BACKUP-RESTORE-DRILL.md](./BACKUP-RESTORE-DRILL.md) for drill steps.
