# iPhone Safari smoke harness — Driver PWA

Manual gate (not part of default CI). Uses Playwright **iPhone 14** device profile against the production Driver PWA URL.

## Run

From repo root:

```bash
npm run test:iphone-safari
```

Or from `apps/frontend`:

```bash
npm run test:iphone-safari
```

Install browsers once (if needed):

```bash
cd apps/frontend && npx playwright install webkit
```

## Prerequisites

1. **Driver identity**: `DRIVER_SMOKE_EMAIL` must belong to an **identity user linked to an active `mdata.drivers` row**.
2. **Bypass secret (server + client)**:
   - Render (API) must set `AUTH_EMAIL_TEST_BYPASS_SECRET` (same value used locally by Playwright).
   - Optional override code: `AUTH_EMAIL_TEST_BYPASS_CODE` (defaults to `000000` on both sides if unset).
3. Playwright sends header `x-ih35-auth-test-bypass: <AUTH_EMAIL_TEST_BYPASS_SECRET>` on every request from the smoke browser context.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DRIVER_SMOKE_EMAIL` | Yes | Email login step |
| `AUTH_EMAIL_TEST_BYPASS_SECRET` | Yes | Header + server bypass gate |
| `AUTH_EMAIL_TEST_BYPASS_CODE` | No | Defaults to `000000` |
| `DRIVER_PWA_SMOKE_URL` | No | Defaults to `https://driver.ih35dispatch.com` |
| `DRIVER_SMOKE_LAT` / `DRIVER_SMOKE_LNG` | No | Geolocation injection for stop geofence checks |
| `IH35_SMOKE_API_ORIGIN` | For dispute POST | API origin (must match driver session cookies domain rules) |
| `DRIVER_SMOKE_SETTLEMENT_ID` | For dispute POST | UUID of an eligible settlement |
| `DRIVER_SMOKE_OPERATING_COMPANY_ID` | For dispute POST | UUID for `operating_company_id` query param |

If dispute variables are omitted, step **08** attaches a skip note instead of failing the suite.

## Outputs

Playwright attaches **PNG screenshots per step** plus small text/JSON artifacts (`pwa-signals`, dispute response).

## Notes

- “Safari” fidelity in CI is approximated via Playwright **WebKit**; always perform a **physical device check** before MVP sign-off.
- Rotating or removing `AUTH_EMAIL_TEST_BYPASS_SECRET` immediately disables automated login bypass (by design).
