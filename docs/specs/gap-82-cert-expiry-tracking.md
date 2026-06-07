# GAP-82 — Medical Card + CDL Expiry Tracking

## Scope

GAP-82 adds additive certificate-expiry monitoring for active drivers and exposes results to Safety surfaces.

Tracked certificate classes:

1. CDL
2. Medical card (latest `safety.medical_cards` or `mdata.drivers.dot_medical_expires_at`)
3. Hazmat endorsement
4. TWIC
5. Passport
6. Drug test due date (derived from latest test date + 365 days)

## Severity windows

- `critical`: `< 14` days
- `warn`: `15-30` days
- `info`: `31-60` days

Outside 60 days is not emitted by the monitor.

## Backend API

- `GET /api/safety/cert-expiry/all?operating_company_id=<uuid>&severity=&cert_type=`
- `GET /api/safety/cert-expiry/driver/:uuid?operating_company_id=<uuid>`

Both routes require authenticated office session and company-tenant scope.

## Worker

- `apps/backend/src/jobs/cert-expiry-monitor.ts`
- Schedule: `0 6 * * *` (`America/Chicago`)
- Runs fleet scan per active company and dispatches critical notifications.

## Frontend

- `ExpiryDashboard` is mounted inside DOT Compliance tab and provides severity/cert filters.
- Driver header now renders cert expiry badges for CDL, medical, hazmat, and passport fields.
- Safety nav includes a "Cert Expiry" entry mapped to DOT Compliance.

## Verification

- `npm run verify:cert-expiry-tracking`
- Validates monitor service, routes, worker, dashboard, badges, docs, and manifest markers.
