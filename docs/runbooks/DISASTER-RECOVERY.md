# Disaster Recovery — IH35 TMS

**Block:** CLOSURE-23-DR-BACKUP-AUDIT  
**Owner:** Jorge  
**Updated:** 2026-06-05

## Objectives

| Metric | Target | Mechanism |
|--------|--------|-----------|
| **RPO** (Recovery Point Objective) | 5 minutes | Neon continuous PITR (WAL archiving) |
| **RTO** (Recovery Time Objective) | 30 minutes | Provision Neon branch + update Render env + redeploy |

**Neon project:** `IH35-TMS` (`tiny-field-89581227`)  
**PITR retention:** 7 days (`history_retention_seconds: 604800`)  
**Primary branch:** `production`

---

## Scenario A — Single deploy failure

**Trigger:** Bad application commit merged; API 500s but database intact.

| Step | Action |
|------|--------|
| 1 | Render dashboard → affected service → **Rollback** to last live deploy |
| 2 | Verify `GET /api/v1/health` → `ok` |
| 3 | Verify `GET /api/v1/health/deep` → all dependencies green |
| 4 | Post-mortem in incident channel |

**Communication template:**

> IH35 TMS — deploy rollback executed at {TIME_CT}. Service restored to commit {SHA}. Root cause investigation in progress. No data loss expected.

---

## Scenario B — Database corruption / bad migration

**Trigger:** Migration or manual SQL corrupted data; application may fail health checks.

| Step | Action |
|------|--------|
| 1 | **Stop writes** — scale Render backend to 0 or enable maintenance mode |
| 2 | Neon console → create branch from PITR timestamp **before** incident |
| 3 | Run verification queries (see [BACKUP-RESTORE-DRILL.md](./BACKUP-RESTORE-DRILL.md)) |
| 4 | Update Render `DATABASE_URL` + `DATABASE_DIRECT_URL` to restored branch |
| 5 | Redeploy backend; verify deep health |
| 6 | Re-enable traffic; document data gap window |

**Communication template:**

> IH35 TMS — database PITR restore in progress. Estimated RTO 30 min. Writes paused since {TIME_CT}. Customers may see read-only errors.

---

## Scenario C — Render service outage

**Trigger:** Render region or service unavailable; Neon healthy.

| Step | Action |
|------|--------|
| 1 | Confirm outage via Render status + Better Uptime |
| 2 | If prolonged (>1h): provision backup Render service in alternate region |
| 3 | Point DNS / Cloudflare to backup origin |
| 4 | Same `DATABASE_URL` (Neon is external) |

**Communication template:**

> IH35 TMS — hosting provider outage. Failover to backup region initiated. ETA {ETA}.

---

## Scenario D — Cloudflare outage

**Trigger:** CDN/WAF unavailable; origin healthy.

| Step | Action |
|------|--------|
| 1 | Bypass Cloudflare — point DNS A record to Render origin hostname |
| 2 | Disable Cloudflare proxy (grey cloud) temporarily |
| 3 | Monitor TLS cert on origin |

**Communication template:**

> IH35 TMS — CDN bypass active. Access via direct origin until Cloudflare recovers.

---

## Scenario E — GitHub outage

**Trigger:** Cannot merge PRs or trigger CI; production stable.

| Step | Action |
|------|--------|
| 1 | Deploy hotfix from local: `git push` may fail — use Render manual deploy from last known good commit |
| 2 | Render dashboard → Manual Deploy → paste commit SHA |
| 3 | Resume normal flow when GitHub recovers |

**Communication template:**

> IH35 TMS — GitHub unavailable. Emergency deploy via Render manual deploy. No CI gate until GitHub restores.

---

## Scenario F — Total Neon outage

**Trigger:** Neon platform unavailable; need alternate database.

| Step | Action |
|------|--------|
| 1 | Restore from latest monthly checksum baseline + logical export if available |
| 2 | Provision Supabase / RDS Postgres 16 |
| 3 | Apply migrations: `npm run db:migrate` |
| 4 | Import latest `npm run db:backup` artifact if stored off-site |
| 5 | Update all Render database env vars |
| 6 | Full smoke: PASS-7 endpoints |

**Communication template:**

> IH35 TMS — primary database provider outage. Failover to secondary Postgres in progress. Extended RTO (2–4h). Jorge notified.

---

## Automation

| Script | Purpose |
|--------|---------|
| `scripts/backup-verify-neon-pitr.mjs` | Verify PITR enabled + retention ≥7 days |
| `scripts/backup-restore-drill.sh` | Monthly test restore to ephemeral branch |
| `scripts/backup-checksum-monthly.mjs` | Row-count baseline for drift detection |
| `scripts/verify-backups-current.mjs` | CI guard — PITR freshness on every PR |

## Related runbooks

- [BACKUP-RESTORE-DRILL.md](./BACKUP-RESTORE-DRILL.md)
- [CI-CD-POLICY.md](./CI-CD-POLICY.md) (rollback)
- [INCIDENT-RESPONSE.md](./INCIDENT-RESPONSE.md)
- [MONITORING-PLAYBOOK.md](./MONITORING-PLAYBOOK.md)
