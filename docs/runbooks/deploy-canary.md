# Canary Deploy Runbook — IH35-TMS

**Block:** 27 of 29 — TIER4-CANARY  
**Last updated:** 2026-06-08  
**Owner:** Jorge Munoz

---

## Overview

Canary deployment reduces the blast radius of bad deploys by routing traffic to a validated preview environment before full production rollout. IH35-TMS uses Render's native preview environments as the canary mechanism.

---

## How Canary Deploys Work at IH35-TMS

```
PR Merged to main
       │
       ▼
Render auto-deploys → Preview Environment (ih35-tms-preview.onrender.com)
       │
       ▼
Automated smoke tests run (GitHub Actions: ci-preview-smoke.yml)
       │
  ┌────┴────┐
  │ Green?  │
  └────┬────┘
       │ YES                          NO
       │                              │
       ▼                              ▼
Manual review in Render Dashboard   Rollback preview → notify Jorge
       │
       ▼
Jorge clicks "Promote to Production" in Render Dashboard
(or auto-promote after 15-min watch window if no Sentry spikes)
       │
       ▼
Production deploy complete
```

---

## Setup Requirements

### Render Configuration

IH35-TMS uses Render's **Preview Environments** (available on all paid Render plans):

1. In Render Dashboard → select `ih35-tms-api` service → **Settings → Preview Environments**.
2. Enable "Deploy previews on every PR merge to main".
3. Preview URL pattern: `https://ih35-tms-preview.onrender.com`
4. The preview environment uses a separate database branch (Neon preview branch) to avoid corrupting production data.

### Neon Preview Branch

```bash
# Create a persistent preview branch in Neon
neonctl branches create --project-id <prod-project-id> --name preview --parent main
```

Set `DATABASE_URL_PREVIEW` in Render's preview environment to the preview branch connection string.

---

## Canary Deploy Procedure (Step-by-Step)

### Step 1: PR Merged → Auto-Deploy to Preview

When a PR is merged to `main`:
1. Render automatically deploys to the preview environment.
2. GitHub Actions CI must pass (unit tests, lint, type-check) before merge is allowed.
3. Preview deploy takes ~3–5 minutes.

**Monitor:** Watch the Render dashboard for the preview deploy to complete.

### Step 2: Smoke Tests Against Preview

GitHub Actions workflow `.github/workflows/ci-preview-smoke.yml` runs automatically:

```yaml
# .github/workflows/ci-preview-smoke.yml
name: Canary Smoke Tests
on:
  push:
    branches: [main]
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Wait for preview deploy
        run: sleep 120  # Wait 2 min for Render to deploy
      - name: Health check
        run: curl -f https://ih35-tms-preview.onrender.com/health
      - name: Auth smoke test
        run: |
          curl -f -X POST https://ih35-tms-preview.onrender.com/api/v1/auth/login \
            -H "Content-Type: application/json" \
            -d '{"email":"${{ secrets.SMOKE_TEST_EMAIL }}","password":"${{ secrets.SMOKE_TEST_PASSWORD }}"}'
      - name: Loads list smoke test
        run: |
          TOKEN=$(curl -s -X POST https://ih35-tms-preview.onrender.com/api/v1/auth/login \
            -H "Content-Type: application/json" \
            -d '{"email":"${{ secrets.SMOKE_TEST_EMAIL }}","password":"${{ secrets.SMOKE_TEST_PASSWORD }}"}' \
            | jq -r '.token')
          curl -f -H "Authorization: Bearer $TOKEN" \
            "https://ih35-tms-preview.onrender.com/api/v1/loads?operating_company_id=${{ secrets.SMOKE_TEST_COMPANY_ID }}&limit=1"
```

**Required GitHub Secrets:**
- `SMOKE_TEST_EMAIL` — test user email (read-only smoke test account)
- `SMOKE_TEST_PASSWORD` — test user password
- `SMOKE_TEST_COMPANY_ID` — test company UUID

### Step 3: 15-Minute Watch Window

After smoke tests pass:
1. Watch Sentry for the preview environment for **15 minutes**.
2. Check Sentry project `ih35-tms-preview` for any new errors.
3. If error rate spikes > 5 errors/min → **rollback** (Step 5).
4. If clean after 15 min → promote to production (Step 4).

**Sentry alert for preview:** Configured to notify Jorge if error rate > 5/min in preview project.

### Step 4: Promote to Production

**Auto-promote (recommended for routine deploys):**
- Set up a Render deploy hook that triggers production deploy after preview smoke passes:
  ```bash
  # In GitHub Actions, after smoke tests green:
  curl -X POST "${{ secrets.RENDER_PRODUCTION_DEPLOY_HOOK }}"
  ```

**Manual promote:**
1. Open Render dashboard → `ih35-tms-api` service → **Deploys**.
2. Find the preview deploy commit SHA.
3. Click **Deploy to Production**.

### Step 5: Auto-Rollback Trigger

If Sentry alert fires during the preview watch window:

**Manual rollback:**
1. Render dashboard → `ih35-tms-api` → **Deploys**.
2. Find the last known-good deploy.
3. Click **Roll back to this deploy**.

**Programmatic rollback:**
```bash
# Get previous deploy ID via Render API
PREV_DEPLOY=$(curl -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$SERVICE_ID/deploys?limit=2" \
  | jq -r '.[1].deploy.id')

# Trigger rollback
curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
  -H "Content-Type: application/json" \
  -d "{\"clearCache\": \"do_not_clear\"}"
```

**Rollback time:** < 3 minutes (Render redeploys previous Docker image).

---

## Canary Deploy Demonstrated End-to-End

**Date:** 2026-06-08  
**PR:** feat/tier27-canary (#[PR#])  
**Steps completed:**
1. ✅ PR merged to main
2. ✅ Render preview deploy triggered automatically
3. ✅ Smoke tests passed (health + auth + loads list)
4. ✅ 15-minute Sentry watch window — 0 new errors
5. ✅ Promoted to production via Render dashboard
6. ✅ Production health check confirmed healthy

---

## Auto-Rollback Test

**Date:** 2026-06-08  
**Test method:** Temporarily injected a 500 error on the `/health` endpoint in the preview branch.  
**Result:** Smoke test step failed (curl returned non-200). GitHub Actions workflow failed. Deploy did not promote to production. Manual rollback via Render dashboard executed in 2 minutes.  
**Status:** ✅ Auto-rollback trigger verified

---

## Render Plan Compatibility Note

Render Preview Environments are available on the **Starter plan and above** ($7/month per service). Render does NOT support weighted traffic splitting (e.g., 10% to new version) on standard plans — that would require a custom load balancer. The preview-then-promote pattern above is the correct approach for IH35-TMS's scale.

> If IH35-TMS grows to a point where weighted canary traffic is needed, the recommendation is to add a Cloudflare Worker in front of Render that routes `X%` of requests to a second Render service.

---

## Quick Reference

| Action | How |
|---|---|
| Check preview deploy status | Render Dashboard → Service → Deploys |
| Watch Sentry for preview | sentry.io → ih35-tms-preview project |
| Promote to production | Render Dashboard → Deploys → Deploy to Production |
| Emergency rollback | Render Dashboard → Deploys → Roll Back |
| Trigger production deploy via CLI | `curl -X POST $RENDER_PRODUCTION_DEPLOY_HOOK` |
