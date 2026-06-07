# GAP-87 — Audit Log Universal Read-Only Viewer

**Block ID:** GAP-87-AUDIT-LOG-VIEWER  
**Wave:** P2-S  
**Status:** Shipped  
**Route:** `/admin/audit-log`  

## Purpose

Every module in IH35-TMS emits structured audit events to `audit.audit_events`. Prior to GAP-87, forensic investigation required direct database (SQL) access. This block delivers a universal, read-only UI so Owners and SuperAdmins can filter, search, and inspect every audit event without database credentials.

## Data source

`audit.audit_events` — the canonical append-only event log.

```sql
CREATE TABLE audit.audit_events (
  uuid         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_class  TEXT NOT NULL,       -- e.g. "invoice.created", "driver.voided"
  severity     TEXT NOT NULL,       -- 'info' | 'warning' | 'critical'
  payload      JSONB NOT NULL,      -- contains operating_company_id, entity_uuid, before/after
  actor_user_uuid UUID NULL,
  source       TEXT NULL
);
```

## Backend

| File | Purpose |
|------|---------|
| `apps/backend/src/audit/viewer/service.ts` | `queryAuditEvents()` + `getEventDetail()` — read-only SELECT queries |
| `apps/backend/src/audit/viewer/routes.ts` | `GET /api/audit/viewer/events` + `GET /api/audit/viewer/events/:uuid` |

### Filters (`queryAuditEvents`)

| Parameter | SQL translation |
|-----------|----------------|
| `entity_type` | `event_class ILIKE '%<entity_type>%'` |
| `entity_uuid` | `payload->>'entity_uuid' = ...` |
| `user_uuid` | `actor_user_uuid = ...` |
| `action` | `event_class ILIKE '%<action>%'` |
| `from` / `to` | `created_at >= ... AND created_at <= ...` |
| `severity` | `severity = 'critical'` etc. |
| `search_text` | `event_class ILIKE ... OR payload::text ILIKE ...` |

### RBAC

Owner-only (+ SuperAdmin). All other roles receive HTTP 403.

```typescript
if (role !== "Owner" && role !== "SuperAdmin") {
  reply.code(403).send({ error: "forbidden", reason: "Owner-only route" });
}
```

### Read-only guarantee

No POST, PUT, DELETE, or PATCH routes. Service layer contains only SELECT statements. No data mutation paths exist.

## Frontend

| File | Purpose |
|------|---------|
| `apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx` | Main page at `/admin/audit-log` |
| `apps/frontend/src/components/audit/AuditEventCard.tsx` | Detail card: before/after state, actor, evidence |
| `apps/frontend/src/components/admin/SuperAdminNav.tsx` | Sub-navigation bar for admin tools |

### UX flow

1. Owner navigates to `/admin/audit-log`
2. Filter panel: entity type, entity UUID, user UUID, action/event class, severity, date range, free-text search
3. Results table: When · Event class · Severity · Actor · Source
4. Click row → `AuditEventCard` opens below with full payload, before/after diff
5. Pagination: 100 events/page

## CI guard

`scripts/verify-audit-log-viewer.mjs` — validates:
- Backend service + routes exist with correct exports
- `ownerOnly` RBAC guard present
- No write routes
- Frontend page / card / nav exist
- Sidebar config includes audit-log link
- Route guard uses `OwnerSuperAdminRoute`
- `listAuditViewerEvents` + `getAuditViewerEventDetail` exported from frontend API client
- No `useMutation` in viewer page

## Tests

`apps/backend/src/audit/viewer/__tests__/service.test.ts` — 11 tests covering:
- Base SQL generation
- All filter combinations
- Pagination normalization
- Read-only assertion (no INSERT/UPDATE/DELETE in generated SQL)
- ORDER BY DESC
- RBAC role matrix

## Security notes

- Tenant isolation enforced in WHERE clause (`payload->>'operating_company_id' = $1`)
- PII in payload is not stripped at the viewer level — Owner is already the highest-trust role
- RLS policy on `audit.audit_events` allows SELECT but relies on application-level scoping

## Future work

- Investigator role with scoped access (Phase 7 Compliance Center)
- Export to CSV for audit reports
- Alerting on `critical` severity events

