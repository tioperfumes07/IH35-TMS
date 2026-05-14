# iPhone Safari smoke harness — Office + Driver PWA

Manual gate (not part of default CI). Uses Playwright **iPhone 14** device profile (**WebKit**) against production URLs unless overridden.

## Run

From repo root or `apps/frontend`:

```bash
npm run test:iphone-safari
```

Alternate config filename (alias):

```bash
cd apps/frontend && npx playwright test --config=playwright-iphone.config.ts
```

Install browsers once (if needed):

```bash
cd apps/frontend && npx playwright install webkit
```

## Office app smoke (`test-smoke/iphone-office-smoke.spec.ts`)

**Default base URL:** `https://app.ih35dispatch.com`  
Override with **`IH35_OFFICE_SMOKE_URL`**.

These tests assert **unauthenticated** behaviour: login page renders and protected routes redirect to Google OAuth login. When executed from CI or a developer machine, PNGs can be written under `tests/results/iphone-smoke-YYYY-MM-DD/` (see P6-T11205 report template).

Full **authenticated** dispatch list and settlement drill-down require **Google OAuth storageState** or a sanctioned office test bypass — tracked under phase-7 smoke tickets.

## Driver PWA smoke (`test-smoke/iphone-safari.spec.ts`)

Uses the production Driver PWA URL (`DRIVER_PWA_SMOKE_URL`, default `https://driver.ih35dispatch.com`).

### Prerequisites

1. **Driver identity**: `DRIVER_SMOKE_EMAIL` must belong to an **identity user linked to an active `mdata.drivers` row**.
2. **Bypass secret (server + client)**:
   - Render (API) must set `AUTH_EMAIL_TEST_BYPASS_SECRET` (same value used locally by Playwright).
   - Optional override code: `AUTH_EMAIL_TEST_BYPASS_CODE` (defaults to `000000` on both sides if unset).
3. Playwright sends header `x-ih35-auth-test-bypass: <AUTH_EMAIL_TEST_BYPASS_SECRET>` on every request from the smoke browser context.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DRIVER_SMOKE_EMAIL` | Yes (driver suite) | Email login step |
| `AUTH_EMAIL_TEST_BYPASS_SECRET` | Yes (driver suite) | Header + server bypass gate |
| `AUTH_EMAIL_TEST_BYPASS_CODE` | No | Defaults to `000000` |
| `DRIVER_PWA_SMOKE_URL` | No | Defaults to `https://driver.ih35dispatch.com` |
| `DRIVER_SMOKE_LAT` / `DRIVER_SMOKE_LNG` | No | Geolocation injection for stop geofence checks |
| `IH35_SMOKE_API_ORIGIN` | For dispute POST | API origin (must match driver session cookies domain rules) |
| `DRIVER_SMOKE_SETTLEMENT_ID` | For dispute POST | UUID of an eligible settlement |
| `DRIVER_SMOKE_OPERATING_COMPANY_ID` | For dispute POST | UUID for `operating_company_id` query param |

If dispute variables are omitted, step **08** attaches a skip note instead of failing the suite.

## Outputs

Driver suite attaches **PNG screenshots per step** plus small text/JSON artifacts (`pwa-signals`, dispute response). Office suite writes full-page PNGs to the repo `tests/results/...` path in addition to Playwright attachments.

## Notes

- “Safari” fidelity in CI is approximated via Playwright **WebKit**; always perform a **physical device check** before MVP sign-off.
- Rotating or removing `AUTH_EMAIL_TEST_BYPASS_SECRET` immediately disables automated driver login bypass (by design).
