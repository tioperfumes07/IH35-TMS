# GAP-69 — Driver Manager Home Role-Specific View

**Block ID:** `GAP-69-DRIVER-MANAGER-HOME`  
**Wave:** P2-J · Lane A  
**Status:** Shipped in `feature/gap-69-driver-manager-home`

## Problem

Driver Managers previously saw the generic home dashboard. They need a focused view covering unread driver communications, late arrivals, layover per-diem decisions, pending settlements, expiring credentials, driver scoring trends, and cooling (idle) drivers.

## API

### `GET /api/driver-manager/role-home`

**Query:** `operating_company_id` (uuid, required)

**RBAC:** Manager, Owner, Administrator

**Response:**

```json
{
  "kpis": {
    "unread_driver_comms": 0,
    "late_arrivals_7d": 0,
    "pending_settlements": 0
  },
  "attention_items": [
    {
      "item_id": "unread_driver_comms",
      "source": "driver_comms",
      "severity": "warning",
      "severity_rank": 2,
      "title": "3 unread driver messages",
      "body": "...",
      "count": 3,
      "action_url": "/drivers/messages",
      "action_label": "Open driver comms"
    }
  ],
  "late_arrivals_by_driver": [],
  "pending_layovers": 0,
  "expiring_certs_30d": 0,
  "scoring_leaderboard": { "top": [], "bottom": [] },
  "cooling_drivers": [],
  "computed_at": "2026-06-07T02:00:00.000Z"
}
```

Attention items are sorted by `severity_rank` ascending (critical first).

## Frontend

| File | Purpose |
|------|---------|
| `apps/frontend/src/pages/home/roles/DriverManagerHome.tsx` | Driver Manager home shell |
| `apps/frontend/src/components/home/DriverManagerKpiBar.tsx` | Top KPI row |
| `apps/frontend/src/components/home/DriverManagerAttentionPanel.tsx` | Middle attention panel |
| `apps/frontend/src/pages/home/HomePage.tsx` | Routes `Manager` role → `DriverManagerHome` |

## Backend

| File | Purpose |
|------|---------|
| `apps/backend/src/driver-manager/role-views/dm-home.service.ts` | Data aggregation with graceful degradation |
| `apps/backend/src/driver-manager/role-views/routes.ts` | Route registration |
| `apps/backend/src/driver-manager/role-views/__tests__/dm-home.test.ts` | Unit tests |

## CI Guard

`scripts/verify-driver-manager-home.mjs` — registered as `verify:driver-manager-home` in `package.json` and `.github/workflows/ci.yml`.

## Data Sources

| KPI / Alert | Source table / service |
|-------------|------------------------|
| Unread driver comms | `mdata.driver_profile_messages` (GAP-18 inbound) |
| Late arrivals (7d) | `dispatch.stop_arrivals` (GAP-30) |
| Pending layovers | `dispatch.driver_layovers` (GAP-28) |
| Pending settlements | `driver_finance.driver_settlements` (GAP-15 validation state) |
| Expiring certs (30d) | `cert-monitor.service` (GAP-82) |
| Scoring leaderboard | `safety.harsh_events` + `driver-scoring.service` (GAP-60) |
| Cooling drivers | `mdata.drivers` + load/comms activity (14d+ idle) |

All sources degrade gracefully when tables are absent.
