# GAP-85 — Permit + Toll Tag Tracking

Operational tracking for unit-level oversize/overweight/hazmat permits and toll transponder tags (TxTAG, EZ-Pass, I-Pass, etc.).

## Schema (migration `0407_permits_toll_tags.sql`)

- `master_data.unit_permits` — permit type, issuing state, number, effective/expiration dates, optional cost and PDF evidence
- `master_data.unit_toll_tags` — tag network, number, activation/deactivation, monthly fee, current balance, auto-replenish flag
- Soft-delete via `deleted_at` (no hard `DELETE` in application code)

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/units/:unit_uuid/permits?operating_company_id=` | List active permits + expiry alerts for unit |
| POST | `/api/units/:unit_uuid/permits?operating_company_id=` | Create permit |
| PATCH | `/api/units/:unit_uuid/permits/:uuid?operating_company_id=` | Update permit |
| DELETE | `/api/units/:unit_uuid/permits/:uuid?operating_company_id=` | Soft-delete permit |
| GET | `/api/units/:unit_uuid/toll-tags?operating_company_id=` | List tags + low-balance flags |
| POST | `/api/units/:unit_uuid/toll-tags?operating_company_id=` | Create tag |
| PATCH | `/api/units/:unit_uuid/toll-tags/:uuid?operating_company_id=` | Update tag (incl. balance) |
| DELETE | `/api/units/:unit_uuid/toll-tags/:uuid?operating_company_id=` | Soft-delete tag |

## Expiry alerts (GAP-82 integration)

`cert-monitor.service.ts` exports `scanUnitPermitExpiries`, reusing `computeSeverity` thresholds from driver cert monitoring. The daily `cert-expiry-monitor` job emits in-app notifications for critical unit permit expiries.

## Frontend

- `UnitDetail.tsx` — tab shell for permits and toll tags
- `UnitPermitsTab.tsx` — permit list with `CertExpiryBadge`
- `UnitTollTagsTab.tsx` — tag list with balance/low-balance indicators

## CI guard

`npm run verify:permits-toll-tags` — migration, routes, tabs, cert-monitor wiring, manifest.
