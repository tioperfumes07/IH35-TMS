# P6-T11205 — iPhone smoke verification (2026-05-14)

**Config:** `apps/frontend/playwright-iphone.config.ts` (re-exports `playwright.iphone-smoke.config.ts`; device **iPhone 14** / WebKit).

**Targets**

| Suite | Base URL | Notes |
| --- | --- | --- |
| Office (new) | `https://app.ih35dispatch.com` (override: `IH35_OFFICE_SMOKE_URL`) | Google OAuth; tests cover **unauthenticated** gates only. |
| Driver PWA (existing) | `https://driver.ih35dispatch.com` | Skipped without `DRIVER_SMOKE_EMAIL` + `AUTH_EMAIL_TEST_BYPASS_SECRET`. |

## Pass / fail summary

| # | Test | Result |
| --- | --- | --- |
| 1 | Office — login page / Google entry renders | **PASS** |
| 2 | Office — `/dispatch` redirects to login | **PASS** |
| 3 | Office — `/driver-finance/settlements` redirects to login | **PASS** |
| 4 | Driver PWA — happy path (login, today list, BOL, disputes) | **SKIP** (missing bypass env in this run) |

**Totals:** **3 passed**, **1 skipped**, **0 failed**.

## Screenshots (committed under repo)

Relative to repository root:

| File | Description |
| --- | --- |
| `tests/results/iphone-smoke-2026-05-14/office-login-iphone.png` | Office login — heading + Google CTA |
| `tests/results/iphone-smoke-2026-05-14/office-dispatch-gate-iphone.png` | After visiting `/dispatch` unauthenticated (login gate) |
| `tests/results/iphone-smoke-2026-05-14/office-driver-finance-gate-iphone.png` | After visiting `/driver-finance/settlements` unauthenticated |

> Note: All three captures show the same login surface in this run (expected for unauthenticated smoke).

## Gaps vs ticket wording

| Requested check | Status |
| --- | --- |
| Settlement **detail** URL | No dedicated authenticated route exercised (office uses list route only); **P7-FIX-OFFICE-SMOKE-002**. |
| Accept-load button | Lives on **Driver PWA** (`test-smoke/iphone-safari.spec.ts`), not office — run requires driver env secrets. |
| Full “dispatch list view” while authenticated | Blocked by Google OAuth; needs stored session or test-only bypass — **P7-FIX-OFFICE-SMOKE-001**. |

## Regressions

None observed on the three passing office smoke checks against production on this date.

## Command log

```bash
cd apps/frontend && npx playwright test --config=playwright-iphone.config.ts
```
