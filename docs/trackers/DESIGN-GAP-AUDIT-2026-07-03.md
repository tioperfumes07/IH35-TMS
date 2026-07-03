# Design-vs-Implementation Gap Audit — 2026-07-03

Cross-checked Jorge's design mockups/specs (planner/scheduler + dispatch/book-load, May–Jun 2026 vintage) against
origin/main. Answers "designs with logic that were never implemented." All gaps are NON-financial except the fuel
optimizer's migration.

## Ranked unbuilt design logic (by owner value)
1. **Driver Scheduler — driver PWA leave-request UI.** Backend + office side FULLY BUILT & live (migration 0129,
   driver-scheduler.service/routes, office grid pages, 6 tables w/ RLS + audit). MISSING: the driver-facing PWA
   pages (My Schedule / New Leave Request 5-step bilingual / My Requests) — so drivers can't originate a request and
   the whole approval workflow is inert. + 3 leave crons (reminder, Jan-1 balance rollover, escalation) missing.
   Tier: frontend-only (PWA), no migration, non-financial. **BUILDING (feat/driver-scheduler-pwa-leave-ui).**
2. **Love's Fuel Route Planner — the actual optimizer.** DESIGN NEVER IMPLEMENTED — a convincing empty shell:
   fuel.route_recommendations/recommended_stops/loves_prices_daily never created or populated, "+ Plan trip"
   hard-disabled, planner "logic" fakes flat 150mi distance, no price-by-state/IFTA optimization, no per-load
   pre-routing consumer (book-load emits dispatch.fuel_planner with no consumer). Tier: backend + MIGRATION (§1.3
   gate) + real routing/price optimizer. Highest effort, real fuel-savings value.
3. **Tasks Planner grid.** Missing the defining mockup visuals: multi-day colspan spanning, rowspan employee
   stacking, light-vertical/heavy-horizontal borders. Create-Task modal missing fields (type/start-end/time/
   location/progress%/checkin-cadence/escalate-to) that DB+API ALREADY support (pure form-wiring). Tier:
   frontend-only, no migration. DECISION: design said Expense/Income = label with NO accounting FK; built as
   task_type_id FK to tasks.task_type lookup (doesn't post) — Jorge's ruling before changing.
4. **Dispatch Home v2.** Data present but layout differs: missing idle-units panel (sorted hours-since-delivery) +
   live per-row driver-status column. Tier: frontend-only, low incremental value.
5. **Book Load v2 — FULLY BUILT** (all 5 gaps: time-window dropdown, driver instructions, OCR rate-con, expected
   adjustments, practical-vs-shortest miles). No rebuild.

## Design-freshness flags (never rebuild verbatim)
- Palette: mockups use #1A1F36 / green actions; LOCKED §7 is navy #1F2A44, green = Class-pill only. Restyle on rebuild.
- Validate schema names: no mdata.loads.trailer_id, no mdata.loads.hazmat column (hazmat via optimizer/jsonb).
- Driver PWA uses its own dark theme (pwaBg #0F1219), not office §7 navy.

## Also from the lost-code audit (3 truly-lost, non-financial)
- verify-no-swallow-on-money-paths.mjs (CI guard — only a TODO stub remains) — highest value, BUILDING next.
- scripts/e2e-load-lifecycle 8-scenario prod-DB harness (needs gated DB access).
- universal dead-control audit guard (low priority — concrete bug already fixed).
