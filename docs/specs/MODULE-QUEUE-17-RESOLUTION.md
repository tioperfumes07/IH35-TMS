# MODULE-BUILD QUEUE (17) — STEP-0 RESOLUTION (already-built, not rebuilt)

GUARD's `IH35-MODULE-BUILD-BLOCKS-17-COMPLETE` queue (2026-06-26) was derived from `docs/blocks/*` stubs
that read PENDING. STEP-0 verification on `origin/main` proves **all 17 are already built and wired** — the
PENDING was a false signal (the stubs named no artifacts, so the evidence classifier couldn't see the feature).
**No mass-build** (would duplicate live features — STEP-0c + ADDITIVE-ONLY). This is the 3rd recurrence of the
false-PENDING class (block-10, DISP-OVERVIEW, now the whole queue) — see the CI guard in §4.

## Per-block map — ALREADY-BUILT (verified artifacts on main)
| # | Block | Real page | Real backend | Verdict |
|---|---|---|---|---|
| 01 | DISP-OVERVIEW | `pages/dispatch/DispatchOverview.tsx` | `dispatch/arch-tabs.routes.ts` | ✅ BUILT |
| 02 | DISP-PROFIT | `pages/dispatch/TripProfitability.tsx` | `dispatch/load-profitability.routes.ts` | ✅ BUILT |
| 03 | DISP-KANBAN | `pages/dispatch/DispatchBoard.tsx` | `dispatch/loads.routes.ts` | ✅ BUILT |
| 04 | SAFE-W3 | `pages/home/roles/SafetyHome.tsx` | `safety/dvir.routes.ts`, `safety/foundation-kpis.routes.ts` | ✅ BUILT |
| 05 | SAFE-W4 | (driver credentials/ELD) | `safety/medical-cards.routes.ts`, `safety/reminders.routes.ts`, `telematics/hos-tracker.routes.ts` | ✅ BUILT |
| 06 | SAFE-W5 | `pages/safety/DrugAlcoholDashboard.tsx` | `safety/drug-program.routes.ts` + `verify-drug-alcohol-program.mjs` | ✅ BUILT |
| 07 | MNT-SHOP | (maintenance parts) | `maintenance/parts.routes.ts`, `parts-inventory.routes.ts`, `severe-repair-estimate.routes.ts` | ✅ BUILT |
| 08 | RPT-MODULE | `pages/reports/ReportsHub.tsx`, `pages/safety/audit-425c/Audit425cPage.tsx` | `reports/scheduled-reports.routes.ts` | ✅ BUILT |
| 09 | INS-MODULE | `pages/insurance/InsuranceLanding.tsx` | `insurance/policy.routes.ts`, `insurance/summary.routes.ts` | ✅ BUILT |
| 10 | MX-OPS | `pages/dispatch/BorderCrossingHistoryPage.tsx`, `BorderCrossingWizardPage.tsx` | `dispatch/dispatch-refinements.routes.ts` | ✅ BUILT |
| 11 | CAP-GPS | `pages/dispatch/MapView.tsx` | `telematics/positions.routes.ts`, `fleet-location-hos.routes.ts` | ✅ BUILT |
| 12 | CAP-AUTOSTATUS | (driver PWA suggestion) | `driver/status-suggestions.routes.ts` | ✅ BUILT |
| 13 | CAP-ENGINEWO | `pages/maintenance/FaultRulesPage.tsx`, `FaultDraftsPage.tsx` | (fault-rule engine) | ✅ BUILT |
| 14 | CAP-FUELFRAUD | `pages/fuel/fraud-alerts/FraudAlertsList.tsx` | (fuel fraud) | ✅ BUILT |
| 15 | CAP-CARGOTEMP | `pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx` | + `verify-cap-14-cargo-sensors.mjs` | ✅ BUILT |
| 16 | CAP-PREDICTIVE | `pages/maintenance/TireProgramPage.tsx` | `maintenance/tires.routes.ts` | ✅ BUILT |
| 17 | CAP-SCORING | `pages/safety/CSAScore.tsx` | `safety/driver-scoring.routes.ts` | ✅ BUILT |

(Full verified artifact list per block is appended to each `docs/blocks/<ID>.txt` footer; the exact paths were
existence-checked against `origin/main` by `scripts/backfill-block-stub-artifacts.mjs` before writing.)

## RESIDUAL REAL-BUILD LIST
**EMPTY.** Zero blocks of the 17 are ABSENT; zero are PARTIAL. Nothing in this queue requires a build.

## Tracker effect (honest counts)
Backfilling the stubs with their real artifacts let the evidence classifier auto-promote them:

| | before | after |
|---|---|---|
| DONE | 331 | **350** |
| NEEDS-VERIFY | 69 | 69 |
| PENDING | 32 | **13** |
| PENDING (GATED) | 24 | 24 |
| **TOTAL PENDING** | **56** | **37** |

(+19 DONE = the 17 module blocks + 2 pre-existing `-DONE` stubs, HOS-VIEWER & UX-A, that also named no
artifacts and were caught by the new guard.)

## §4 — CI guard (permanently kills the false-PENDING class)
`scripts/verify-block-stub-artifacts.mjs` (wired into `verify:arch-design`): **any `docs/blocks` stub that
self-claims completion (`-DONE` filename, `STATUS: DONE`, ✅, "GUARD-verified live") MUST name ≥1 signature
artifact path that exists on `origin/main`.** Genuinely-unbuilt forward specs (no completion claim) are exempt —
they correctly have no artifacts yet, so the guard does not force fake paths on the 44 unbuilt stubs. This
catches all three historical recurrences (block-10, DISP-OVERVIEW, the queue) at their root: a built/claimed
block that is invisible to the classifier.

GUARD spot-checks a sample of the 19 promotions; each residual (none) is confirmed before any build.
