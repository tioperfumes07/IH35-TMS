# GAP-83 — ELD Audit Trail Read-Only Viewer

## Scope

GAP-83 surfaces mirrored Samsara HOS log edit history for DOT auditors and safety staff. The feature is strictly read-only — IH35 TMS never mutates ELD records.

Data source: `samsara.hos_log_edits` mirror (populated by Samsara sync).

## Backend API

- `GET /api/safety/eld/audit-trail?operating_company_id=<uuid>&driver=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Returns chronological edit list with `edited_at`, `edited_by`, `reason`, and before/after field states.
  - Includes `pdf_payload` for DOT export.
- `GET /api/safety/eld/audit-trail/driver/:uuid/recent?operating_company_id=<uuid>`
  - Returns the latest mirrored edits (30-day window, max 25 rows) for embedded driver views.

Both routes require authenticated office session and operating-company tenant scope via `app.operating_company_id`.

## Frontend

- `/safety/eld/audit-trail` — `EldAuditTrailViewer` with driver picker, date range, timeline, and DOT PDF export.
- Driver detail — new **ELD Edits** tab embeds `EldEditHistoryTimeline`.

## Read-only enforcement

- Routes expose GET handlers only.
- `assertReadOnlySurface` rejects non-GET methods.
- Service responses include `read_only: true`.

## Verification

- `npm run verify:eld-audit-trail`
- Validates viewer service, routes, tests, frontend surfaces, docs, manifest, CI wiring.

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main:
  - scripts/verify-eld-audit-trail.mjs
