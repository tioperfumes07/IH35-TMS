# NOW — ONE SOURCE (2026-09-01 · seats paused · continuous)

U14 = **CLOSED** (14/14 CERTIFIED — never recertify). Register: `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.csv`

**Live census @ 2026-09-01 ~17:00Z:** API `healthz/shallow` **`b3599e0`** · origin/main **`ba0e110`** · FE `/version.json` **`ba0e110`** (unblocked — `ih35-tms-web` `dep-dabg83ugekts73amie2g` live). **Do not** treat GO-0014 (`069d531`) as NOW.

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
| **Cursor** | Feed seats (`FEED/NOW-*` + Desktop sync) · leftover unique FE · WIR-04 honesty. **Do not** `trigger_deploy` (API still `b3599e0`; FE matches main) |
| **Devin-A** | Live Chrome **now** on FE `ba0e110` |

## Deploy law

- **API** (`srv-d7rpem7avr4c73fhp4n0`): autoDeploy **no** — `.github/workflows/render-trigger-deploy.yml` when main ahead of live (triggered this session).
- **FE** (`srv-d7s46dbrjlhs7383i150` / `ih35-tms-web`): autoDeploy **yes/commit** — live **`ba0e110`** as of 16:59Z. Do not second-kick.
- **Never** per-merge `trigger_deploy` (Rule 42).
