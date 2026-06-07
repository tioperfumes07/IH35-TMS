# GAP-65 — Owner Today's Attention Top-5 Aggregator

**Block:** GAP-65  
**Wave:** P2-H · Lane A  
**Status:** Shipped  
**PR:** feature/gap-65-owner-attention  

---

## Problem

Owner home showed many cards but no ranked priority. Owner had to scan everything to find what needed a decision today. Decision fatigue → important items missed.

## Solution

A scored + ranked aggregator that pulls from 10 source modules every 15 minutes and surfaces the top-5 highest-priority items at the top of the Owner home page. Each item has an action button (navigate to the relevant page) and a dismiss control (Owner-only, audited).

---

## Architecture

### Backend

| File | Purpose |
|------|---------|
| `apps/backend/src/owner/todays-attention/aggregator.service.ts` | 10-source scoring engine, returns ranked `AttentionItem[]` |
| `apps/backend/src/owner/todays-attention/routes.ts` | `GET /api/v1/owner/todays-attention` + `POST /api/v1/owner/todays-attention/dismiss/:item_id` |
| `apps/backend/src/owner/todays-attention/__tests__/aggregator.test.ts` | Unit tests: ranking, dedup, RLS, graceful degradation |
| `apps/backend/src/jobs/todays-attention-worker.ts` | 15-min background worker, upserts snapshot table |
| `db/migrations/0405_owner_todays_attention_snapshot.sql` | Snapshot table with RLS, unique constraint per (company, item_id) |

### Frontend

| File | Purpose |
|------|---------|
| `apps/frontend/src/components/home/TodaysAttentionTop5.tsx` | Ranked card list, re-polls every 15 min |
| `apps/frontend/src/components/home/AttentionItemCard.tsx` | Per-item card with severity badge, score, action, dismiss |
| `apps/frontend/src/pages/home/OwnerHome.tsx` | Owner-specific home view, `TodaysAttentionTop5` at top |
| `apps/frontend/src/api/home.ts` | `fetchOwnerTodaysAttention` + `dismissOwnerAttentionItem` |
| `apps/frontend/src/routes/manifest.tsx` | `HomeRoute` forks: Owner → `OwnerHome`, others → `HomePage` |
| `scripts/verify-owner-todays-attention.mjs` | CI guard: 21 checks, EXIT 0 = pass |

---

## Scoring Sources

| Source | Score | Table / GAP |
|--------|-------|-------------|
| 425C filing deadline within 7 days | 100 | `legal.form_425c_filings` |
| Critical fuel fraud alerts | 95 | `fuel.fraud_alerts` (GAP-61) |
| Bank account drift | 90 | `banking.reconciliation_drift_alerts` (GAP-53) |
| Severe engine fault WOs | 90 | `maintenance.work_orders` (GAP-58) |
| Cargo sensor out-of-range | 85 | `telematics.cargo_sensor_incidents` (GAP-64) |
| Period-close warnings | 80 | `accounting.period_close_warnings` (GAP-16) |
| Driver damage liabilities | 80 | `safety.accident_liabilities` (GAP-12) |
| Pending detention approvals | 75 | `mdata.detention_requests` (GAP-19) |
| Cooling customers (cold tier) | 70 | `mdata.customer_health_scores` (GAP-36) |
| At-risk units brake/tire ≤7d | 65 | `maintenance.predictive_alerts` (GAP-62/63) |

**Graceful degradation:** Each source wraps DB queries in try/catch. If a source module has not shipped yet (table does not exist), the source is silently skipped. The top-5 is built from whatever sources are available.

---

## RBAC

- `GET /api/v1/owner/todays-attention` — Owner or Administrator only (403 for other roles)
- `POST /api/v1/owner/todays-attention/dismiss/:item_id` — Owner or Administrator only (403 for other roles)
- Dismiss action is audit-logged to `audit.audit_log` (best-effort, non-fatal)
- Worker uses lucia bypass for cross-company iteration

---

## Snapshot Table

```
owner.todays_attention_snapshot
  id                    uuid PK
  operating_company_id  uuid NOT NULL
  item_id               text NOT NULL   -- stable key per source
  source                text NOT NULL
  score                 integer NOT NULL (0–100)
  title / body / action_url / action_label / severity
  extra                 jsonb
  dismissed             boolean
  dismissed_by          uuid
  dismissed_at          timestamptz
  computed_at           timestamptz
  created_at / updated_at
```

- Unique constraint: `(operating_company_id, item_id)` — enables upsert on re-compute
- RLS enabled: Owner/Administrator can SELECT and UPDATE; system writes via lucia bypass
- Dismissed items reset after 24 hours so recurring issues re-surface

---

## Recon Findings (spec vs reality)

| Spec Assumption | Reality | Resolution |
|----------------|---------|------------|
| `OwnerHome.tsx` exists (EDIT) | File did not exist | Created as new additive file |
| `owner.todays_attention_snapshot` exists (Phase 4) | Table not found in migrations | Created via migration 0405 |
| Lane A disjoint from Lane B | Confirmed: no overlap with `DispatcherHome.tsx` (Lane B GAP-66) | ✅ |

---

## Acceptance Criteria

- [x] Worker runs every 15 min
- [x] Top 5 ranked correctly (score DESC)
- [x] OwnerHome shows ranked card list (TodaysAttentionTop5 at top)
- [x] Dismiss audited (Owner-only, 403 for other roles)
- [x] verify-owner-todays-attention.mjs in CI — 21/21 checks pass
- [x] Graceful degradation: missing source tables skipped, not errors
- [x] Unit tests pass (ranking, dedup, RLS, graceful degradation)
