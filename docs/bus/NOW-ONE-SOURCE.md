# NOW — ONE SOURCE (2026-09-01 · seats paused · continuous)

U14 = **CLOSED** (14/14 CERTIFIED — never recertify). Register: `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.csv`

**Live census @ 2026-09-01 ~14:45Z:** API `healthz/shallow` **`5de7f40`** · origin/main **`f74631b3`** · FE `/version.json` **`f0c3879`** (stuck — last live deploy before build_failed chain).

## Residual ONLY

| Id | Status | Owner |
|----|--------|-------|
| **CTL-01/02/03** | REPORTED DONE — **Live Chrome VERIFIED stamp pending** | CC-3 (+ Devin-A) |
| **WIR-04** | **BLOCKED** — no attorney-approved W-8BEN template · counsel PR **#19276** | Cursor (honesty only; no e-sign until counsel) |

All other register rows = FIXED or owner-gated elsewhere. **Do not reopen COL/LAY/SRC sweeps.**

## Seat NOW

| Seat | NOW |
|------|-----|
| **CC-1** | `SETL-DUAL-APPROVAL-STATE-CONTRADICTION` · `LINKAGE-INTEGRITY-LAW` · `INV-OPEN-VOID-01` · `GO-INSURANCE` assets/ACV (NO recreate policies; NO-SEAT) |
| **CC-2** | `NO-SEAT-PROD-FINANCIAL-FIXTURES` verify named in GitHub workflow · grade tip `#19273`/`#19271`/`#19264`/`#19262` live after deploy |
| **CC-3** | CTL-01/02/03 Live Chrome USMCA → stamp register **VERIFIED** · leftover unique FINDING only after |
| **Cursor** | **FE deploy lag** — `version.json` stuck `f0c3879` while API at tip; `ih35-tms-web` (`srv-d7s46dbrjlhs7383i150`) **build_failed** (safety list pages bad import depth `../../../../` vs `../../../` for `CatalogListSearchInput` / `catalogListSearchQueryOptions`) · keep feeding seats · leftover unique FE |
| **Devin-A** | Live Chrome after FE deploy unblocks |

## Deploy law

- **API** (`srv-d7rpem7avr4c73fhp4n0`): autoDeploy **no** — `.github/workflows/render-trigger-deploy.yml` when main ahead of live (triggered this session).
- **FE** (`srv-d7s46dbrjlhs7383i150` / `ih35-tms-web`): autoDeploy **yes/commit** — redeploy useless until **tsc green**; fix import paths then auto-deploy or `POST /v1/services/srv-d7s46dbrjlhs7383i150/deploys`.
- **Never** per-merge `trigger_deploy` (Rule 42).
