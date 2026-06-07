# GAP-7 — Severe Repair OOS Fleet Restore Estimate

**Block:** GAP-7  
**Phase:** GAP-HIGH  
**Seam:** Extends existing `severe-repair-estimate.service.ts` / `SevereRepairOosTab` rollup.

## Routes

| Method | Path | RBAC |
|--------|------|------|
| GET | `/api/v1/maintenance/severe-repair/fleet-restore-cost` | authenticated |
| GET | `/api/v1/maintenance/severe-repair/per-unit-breakdown` | authenticated |
| POST | `/api/v1/maintenance/severe-repair/export-pdf` | Owner only |

## Frontend

- `HomeFleetRestoreCard` on `OwnerHome` (Owner role route only).
- Existing `SevereRepairOosTab` aggregate panel unchanged.

## Verify

```bash
npm run verify:severe-repair-estimate
```
