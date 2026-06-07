# GAP-68 — Safety Officer Home Role-Specific View

**Block ID:** `GAP-68-SAFETY-OFFICER-HOME`  
**Wave:** P2-I · Lane B  
**Status:** Shipped in `feature/gap-68-safety-home`

## Problem

Safety Officers previously saw the generic home dashboard. They need a focused view covering DVIR defects, HOS violations, accidents, drug/alcohol program queue, CSA BASIC updates, expiring driver credentials, and open workers comp claims.

## API

### `GET /api/safety-officer/role-home`

**Query:** `operating_company_id` (uuid, required)

**RBAC:** Safety, Owner, Administrator

**Response:**

```json
{
  "kpis": {
    "open_dvir_major_defects": 0,
    "hos_violations_today": 0,
    "expiring_certs_30d": 0,
    "open_accidents_7d": 0,
    "pending_da_draws": 0,
    "open_workers_comp_claims": 0
  },
  "alerts": [
    {
      "alert_id": "dvir_major_defects",
      "source": "dvir_defects",
      "severity": "warning",
      "severity_rank": 1,
      "title": "3 open DVIR major defects",
      "body": "...",
      "count": 3,
      "action_url": "/maintenance/dvir",
      "action_label": "Review DVIR defects"
    }
  ],
  "cert_data_stale": false,
  "computed_at": "2026-06-07T02:00:00.000Z"
}
```

Alerts are sorted by `severity_rank` ascending (critical first).

## Frontend

| File | Purpose |
|------|---------|
| `apps/frontend/src/pages/home/roles/SafetyHome.tsx` | Safety Officer home shell |
| `apps/frontend/src/components/home/SafetyKpiBar.tsx` | Top KPI row |
| `apps/frontend/src/components/home/SafetyAlertsPanel.tsx` | Middle alerts panel |
| `apps/frontend/src/pages/home/HomePage.tsx` | Routes `Safety` role → `SafetyHome` (from PR #642) |

## Backend

| File | Purpose |
|------|---------|
| `apps/backend/src/safety-officer/role-views/safety-home.service.ts` | Data aggregation with graceful degradation |
| `apps/backend/src/safety-officer/role-views/routes.ts` | Route registration |
| `apps/backend/src/safety-officer/role-views/__tests__/safety-home.test.ts` | Unit tests |

## CI Guard

`scripts/verify-safety-officer-home.mjs` — registered as `verify:safety-officer-home` in `package.json` and `.github/workflows/ci.yml`.

## Data Sources

| KPI / Alert | Source table / service |
|-------------|------------------------|
| DVIR major defects | `safety.dvir_defects` |
| HOS violations today | `safety.hos_violations` |
| Accidents (7d) | `safety.accident_reports` |
| D/A random draws | `safety.da_random_pool_draws` |
| CSA updates (30d) | `safety.csa_scores` |
| Expiring certs (30d) | `cert-monitor.service` (GAP-82) |
| Workers comp claims | `safety.workers_comp_claims` |

All sources degrade gracefully when tables are absent.

## Cert Data Freshness

If driver cert metadata is older than 7 days, `cert_data_stale: true` is returned and the alerts panel shows a warning banner. Operators should verify driver file sync before acting on expiry counts.
