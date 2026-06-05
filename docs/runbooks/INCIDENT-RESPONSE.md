# Incident Response — IH35 TMS

**Block:** CLOSURE-21-MONITORING-SETUP  
**On-call:** Jorge (sole operator)  
**Updated:** 2026-06-05

## Severity classification

| Level | Definition | Example | Response target |
|-------|------------|---------|-----------------|
| **SEV1** | Production down; all users blocked | API 503, login broken, data loss risk | Immediate (< 15 min) |
| **SEV2** | Major feature degraded | QBO sync stopped, banking read-only | < 1 hour |
| **SEV3** | Partial degradation | Single module 500s, driver PWA offline | Same business day |
| **SEV4** | Minor / cosmetic | Non-critical UI glitch | Next deploy window |

## On-call rotation

Currently **Jorge only**. Alerts route to Jorge's email via Render + uptime monitors (`scripts/uptime-monitor-config.mjs`).

## Communication template

```
Subject: [SEV{N}] IH35 TMS — {short description}

Status: Investigating | Identified | Mitigating | Resolved
Impact: {who/what affected}
Start: {timestamp CT}
Current actions: {bullet list}
Next update: {time CT}
```

## Rollback procedure

1. Open Render dashboard → affected service (API / web / driver-pwa).
2. **Manual Deploy** → select last known-good commit from `main` history.
3. Verify `GET /api/v1/health` and `/api/v1/health/deep`.
4. Post resolution note with root cause + follow-up ticket.

## Post-incident

- Capture Sentry issue link + Render deploy ID.
- File closure follow-up block if code fix required.
- Update [MONITORING-PLAYBOOK.md](./MONITORING-PLAYBOOK.md) if new runbook gap found.
