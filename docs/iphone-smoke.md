# iPhone smoke — Office + Driver (`SO #18` helpers)

This note complements `docs/testing/iphone-safari-smoke.md` by listing **paste-ready** environment variables for the Playwright suites that ship in-repo.

## Office — unauthenticated gates

Script: `npm run test:iphone-safari` (includes `test-smoke/iphone-office-smoke.spec.ts`).

| Key | Value | Notes |
| --- | --- | --- |
| `IH35_OFFICE_SMOKE_URL` | `https://staging.example.com` | Defaults to production marketing URL if unset — prefer staging for automation. |

## Office — authenticated flows (`smoke:iphone-auth`)

Script: `npm run smoke:iphone-auth`

Requires the Fastify integration bypass **`IH35_TEST_AUTH_BYPASS=1`** on the API plus the **`x-test-auth`** header that Playwright injects (see `apps/backend/src/auth/session-middleware.ts`). Use **non-production** environments only.

| Key | Example | Notes |
| --- | --- | --- |
| `IH35_OFFICE_SMOKE_URL` | `https://staging-office.example.com` | Must serve the Office SPA + proxy `/api` to the same backend receiving headers. |
| `IH35_OFFICE_SMOKE_USER_ID` | `<uuid>` | Required — identity user with tenant access + dispatch/settlement permissions. |
| `IH35_OFFICE_SMOKE_EMAIL` | `dispatcher@example.com` | Optional metadata embedded in the bypass payload (defaults to `smoke-office@example.invalid`). |
| `IH35_OFFICE_SMOKE_ROLE` | `Dispatcher` | Optional override for the injected role (defaults to `Dispatcher`). |
| `AUTH_EMAIL_TEST_BYPASS_SECRET` | `<shared secret>` | Mirrors backend `AUTH_EMAIL_TEST_BYPASS_SECRET`; forwarded as `x-ih35-auth-test-bypass` when present. |

**Skip semantics:** tests call `test.skip` when `IH35_OFFICE_SMOKE_USER_ID` is missing or when the settlements table has zero rows (documented inline in `iphone-office-auth-smoke.spec.ts`).

## Driver PWA — Playwright (`iphone-safari.spec.ts`)

| Key | Example | Notes |
| --- | --- | --- |
| `DRIVER_PWA_SMOKE_URL` | `https://driver.staging.example.com` | Driver PWA origin. |
| `DRIVER_SMOKE_EMAIL` | `driver-linked-user@example.com` | Required for the OTP bypass happy path; triggers `test.skip` when unset. |
| `AUTH_EMAIL_TEST_BYPASS_SECRET` | `<shared secret>` | Must match backend `AUTH_EMAIL_TEST_BYPASS_SECRET`. |
| `AUTH_EMAIL_TEST_BYPASS_CODE` | `000000` | Optional — defaults to `000000` server-side. |

### Vitest guard (`apps/driver-pwa`)

| Key | Notes |
| --- | --- |
| `DRIVER_SMOKE_EMAIL` | When unset the Vitest suite logs a clear message and still passes — run `cd apps/driver-pwa && npm test`. |

## Backend prerequisites shared across suites

| Key | Value | Notes |
| --- | --- | --- |
| `IH35_TEST_AUTH_BYPASS` | `1` | Enables parsing of `x-test-auth` **only** on disposable environments. Never enable in production. |
| `AUTH_EMAIL_TEST_BYPASS_SECRET` | `<secret>` | Required for driver/office email OTP bypass flows under test. |
| `AUTH_EMAIL_TEST_BYPASS_CODE` | `default 000000` | Optional explicit override for the bypass OTP. |
