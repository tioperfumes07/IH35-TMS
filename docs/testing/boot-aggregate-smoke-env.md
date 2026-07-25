# Boot aggregate smoke — fixed unit env (G4-DEPLOY / ACCT-R-04)

`render.yaml` preDeploy runs `npm run ci:boot-aggregate-smoke` against the production database.
The smoke script (`scripts/ci-boot-aggregate-smoke.mjs`) calls
`GET /api/v1/mdata/units/:id` and asserts the Block 11/12 aggregate envelope.

## Problem

When `IH35_SMOKE_UNIT_ID` and `IH35_SMOKE_OPERATING_COMPANY_ID` are unset, the script discovers
the newest active TRANSP unit at deploy time. A single bad row on that unit can fail preDeploy and
roll back every deploy.

## Fix

Set both env vars on the **ih35-tms-backend** Render service (declared in `render.yaml` with
`sync: false` — values live in the Render dashboard, not in git):

| Variable | Meaning |
|---|---|
| `IH35_SMOKE_UNIT_ID` | UUID of a stable TRANSP-owned (or leased-to-TRANSP) unit in `mdata.units` |
| `IH35_SMOKE_OPERATING_COMPANY_ID` | UUID of the TRANSP row in `org.companies` (`code = 'TRANSP'`) |

When both are set, `resolveUnitAndCompany()` skips live discovery and uses the fixed pair.

## Related overrides (optional)

| Variable | Default | Purpose |
|---|---|---|
| `IH35_SMOKE_USER_EMAIL` | `integration.owner@test.invalid` | Test Owner email upserted for the smoke auth header |
| `IH35_SMOKE_USER_ID` | fixed integration UUID | Test Owner identity |
| `IH35_SMOKE_BASE_URL` | loopback | Set only when probing an already-running server |

## Local / CI

For local runs against Neon, export the same pair in your shell or `.env` before
`npm run ci:boot-aggregate-smoke`. `.env.example` documents the keys.

## Guard

`scripts/verify-g4-deploy-smoke-env-in-render.mjs` (verify-step **1492**) fails if either key is
missing from `render.yaml` under `ih35-tms-backend`.
