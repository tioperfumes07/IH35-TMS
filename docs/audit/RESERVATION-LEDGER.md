# RESERVATION LEDGER
**Multi-writer, append-only.** Explicitly carved out of Rule 28 — every agent appends its OWN rows here (Cascade is NOT the sole writer of this file, unlike `AUDIT-COVERAGE-LIVE.md`). Protocol: `docs/audit/RESERVATION-LEDGER-PROTOCOL-2026-08-05.md`.

**Never edit a row in place.** Release/change = a NEW dated row that supersedes the prior one. History is the source of truth for "who holds what right now" — the most recent row per class-id/finding-id/claim-block wins.

**Reserve-before-start (every class/finding):** `git pull --ff-only origin main` → scan for an active `RESERVED` row whose class-id/finding-id matches or whose files overlap yours → overlap = STOP, pick something else → clear = append your row, commit (docs-only, atomic), push, self-merge on green → push rejected (non-ff) = re-pull, re-scan, back off if now taken.

**P0-CLAIM (amendment 2026-08-05 — DELIVERY-METHOD-LOCKED.md §9.0 item 14):** the P0-BLOCKER OVERRIDE (main red for all lanes) stays no-ask, cross-lane, immediate. The first agent to START the fix appends a `P0-CLAIM` row (`Class-id / Finding-id` column = `P0-CLAIM`) **before writing any code**. Any other agent seeing an active `P0-CLAIM` on overlapping files **STANDS DOWN** — no competing fix; offer a diff/comment instead. Release with a superseding `RELEASED` row. Kills the duplicate-fix pattern (4x in one session: ACCT-F117 clash, deduction-ack dup, cert-leak dup, orphaned-tracker-test P0) without slowing the override down.

---

## CLAIM-BLOCKS (Rule 37 verify-step numbers — per-agent, non-overlapping, no shared counter)

Base confirmed 2026-08-05: max claimed in `scripts/verify-steps/CLAIMED-NUMBERS.json` = **2632** (both local and `origin/main`, re-checked after this session's merges). Next free = 2633. Blocks of 30, contiguous, non-overlapping. Retires the even/odd hand-off.

| Type | Agent | Range |
|---|---|---|
| CLAIM-BLOCK | CC-1 | 2633-2662 |
| CLAIM-BLOCK | CC-3 | 2663-2692 |
| CLAIM-BLOCK | CC-2 | 2693-2722 |
| CLAIM-BLOCK | Cascade | 2723-2752 |

**2026-08-05 update:** `2633` was claimed by CC-1 on `main` (#4500, `CLS-GL-DARK` ratchet
`verify-gl-posting-coverage`) after this base was confirmed but before this file landed — it falls
inside CC-1's block as expected, no collision. Next free for CC-1 is **2634**.

Draw the next unused number from your OWN block, record a `CLAIM-<n>` row below, proceed — no waiting on another agent. Rule 37's "claim before author, verified on main" is unchanged; only the number source changes. When a block is ~80% used, append a `BLOCK-REQUEST` row and Cascade allocates the next contiguous block (next base = current max block ceiling + 1, i.e. 2753 for the next round).

---

## ACTIVE RESERVATIONS (seeded 2026-08-05, in-flight this session)

| Timestamp (CST) | Agent | Class-id / Finding-id | Files | Status | Branch/PR |
|---|---|---|---|---|---|
| 2026-08-05T17:50:00-05:00 | CC-1 | CLS-DISP-WIRE-06 | integrations/relay-payments/relay-fuel-canonical-bridge.ts, expense_attribution.expense_load_links | RESERVED | — |
| 2026-08-05T17:50:00-05:00 | CC-1 | CLS-GL-DARK (ratchet) | scripts/verify-gl-posting-coverage.mjs | RESERVED | — |
| 2026-08-05T17:50:00-05:00 | CC-1 | CLS-DUAL-PATH (ratchet) | scripts/verify-qbo-canonical-recon.mjs | RESERVED | — |
| 2026-08-05T17:50:00-05:00 | CC-3 | CLS-DISP-WIRE-07 | apps/backend/.../delivery-evidence-latch.ts, driver/loads.routes.ts, driver-pwa/dispatch-view.routes.ts, mdata/loads.routes.ts | RESERVED | — |
| 2026-08-05T17:50:00-05:00 | CC-3 | CLS-ORPHAN-SURFACE / CLS-UUID-LABEL / CLS-SILENT-CAP | (list on start) | RESERVED | — |
| 2026-08-05T17:50:00-05:00 | CC-2 | verify-after (read-only, docs-only evidence) | — | N/A (no file reservation — read-only never collides) | — |

## KNOWN HOTFILE OVERLAPS (Cascade pre-audit, CLASS-DRAIN CONVERGENCE 2026-08-05 — flag before either side starts)

| Path | Claimed by (card) | Note |
|---|---|---|
| `apps/backend/src/fuel` | `CLS-LINKAGE-ONEWAY` (LINK-005, N/A-PRE-OPERATIONAL — should NOT open a PR here), `CLS-DISP-WIRE-06` (fuel_transactions.load_id backfill), `CLS-ECON-EMPTY` (ECON-005 fuel overage_deduction_id dead code) | 3-way directory-level overlap. Only one of `CLS-DISP-WIRE-06` / `CLS-ECON-EMPTY` should hold this directory at a time — reserve below before starting either. |
| `apps/backend/src/banking` | `CLS-LINKAGE-ONEWAY` (dir-level, LINK-006/007/008 — findings only, no fix assigned yet), `CLS-BANK-MATCH-DENSITY` (SS-003 real defect — `categorization.service.ts`, `categorization.routes.ts`, `banking.routes.ts`) | `CLS-BANK-MATCH-DENSITY`'s SS-003 is the only actionable banking instance right now. Reserve `apps/backend/src/banking/categorization.*` before starting SS-003. |

---

## APPEND-LEASE (short-hold lock for appending to `AUDIT-COVERAGE-LIVE.md`'s Findings table — pull → append → regen → push → release)

*(none active — append here when taking a lease)*

---

## LEDGER ROWS (append below this line, oldest first — do not reorder, do not edit existing rows)
| 2026-08-14T13:13:00-05:00 | Codex | WAVE-A-LOAD-INLINE-SURFACES | required maps + load inline guard | RESERVED | codex/vertical-load-inline-023 |
| 2026-08-14T13:16:00-05:00 | Codex | WAVE-A-LOAD-INLINE-SURFACES | revenue leakage + task drawer load drills | RELEASED-ON-MERGE | codex/vertical-load-inline-023 |
| 2026-08-14T13:03:00-05:00 | Codex | WAVE-A-UNIT-INLINE-SURFACES | cash-flow forecast UI/API/route, fixed asset detail, unit guard | RESERVED | codex/vertical-unit-inline-022 |
| 2026-08-14T13:07:00-05:00 | Codex | WAVE-A-UNIT-INLINE-SURFACES | cash-flow forecast + fixed asset unit paths | RELEASED-ON-MERGE | codex/vertical-unit-inline-022 |
| 2026-08-14T12:48:00-05:00 | Codex | WAVE-A-VENDOR-INLINE-SURFACE | cash-flow forecast UI/API/route + vendor guard | RESERVED | codex/vertical-vendor-inline-021 |
| 2026-08-14T12:50:00-05:00 | Codex | WAVE-A-VENDOR-INLINE-SURFACE | cash-flow forecast vendor path | RELEASED-ON-MERGE | codex/vertical-vendor-inline-021 |
| 2026-08-14T12:39:00-05:00 | Codex | WAVE-A-CUSTOMER-INLINE-SURFACES | cash-flow forecast UI/API, forecast route, dispatch template service, customer linkage guard | RESERVED | codex/vertical-customer-inline-020 |
| 2026-08-14T12:43:00-05:00 | Codex | WAVE-A-CUSTOMER-INLINE-SURFACES | cash-flow forecast + dispatch template customer paths | RELEASED-ON-MERGE | codex/vertical-customer-inline-020 |
| 2026-08-14T12:22:00-05:00 | Codex | WAVE-A-DRIVER-CASH-FORECAST | apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx, apps/frontend/src/api/forecast.ts, apps/backend/src/forecast/cash-forecast-manual.routes.ts, scripts/verify-cash-forecast-driver-linkage.mjs | RESERVED | codex/vertical-driver-inline-019 |
| 2026-08-14T12:28:00-05:00 | Codex | WAVE-A-DRIVER-INLINE-SURFACES | apps/frontend/src/pages/accounting/DisputeQueuePage.tsx | RESERVED | codex/vertical-driver-inline-019 |
| 2026-08-14T12:33:00-05:00 | Codex | WAVE-A-DRIVER-INLINE-SURFACES | apps/backend/src/accounting/disputes.routes.ts | RESERVED | codex/vertical-driver-inline-019 |
| 2026-08-14T12:31:00-05:00 | Codex | WAVE-A-DRIVER-INLINE-SURFACES | cash-flow projection + accounting dispute modal | RELEASED-ON-MERGE | codex/vertical-driver-inline-019 |
| 2026-08-14T12:01:49-05:00 | Codex | REQUIRED-MAP-INLINE-SURFACES | scripts/verify-required-surface-inventory-complete.mjs, docs/specs/scoreboard/modules/*.required.json, docs/specs/scoreboard/wire-sprint-built.json | RESERVED | codex/vertical-abc-017 |
| 2026-08-14T12:13:00-05:00 | Codex | REQUIRED-MAP-INLINE-SURFACES | scripts/verify-required-surface-inventory-complete.mjs, docs/specs/scoreboard/modules/*.required.json, docs/specs/scoreboard/wire-sprint-built.json | RELEASED-ON-MERGE | codex/vertical-inline-surfaces-018 |
| 2026-08-14T12:45:03-05:00 | Codex | VERTICAL-REVERSE-LINK-INLINE-SURFACES | allocation source drill + exact required maps + reverse-link guard | RESERVED | codex/vertical-reverse-inline-024 |
| 2026-08-14T12:46:20-05:00 | Codex | VERTICAL-REVERSE-LINK-INLINE-SURFACES | allocation source drill + exact required maps + reverse-link guard | RELEASED-ON-MERGE | codex/vertical-reverse-inline-024 |
| 2026-08-14T12:49:00-05:00 | Codex | VERTICAL-SETTLEMENT-INLINE-SURFACES | settlement exact three-leaf applicability + guard | RESERVED | codex/vertical-next-inline-025 |
| 2026-08-14T12:49:29-05:00 | Codex | VERTICAL-SETTLEMENT-INLINE-SURFACES | settlement exact three-leaf applicability + guard | RELEASED-ON-MERGE | codex/vertical-next-inline-025 |
| 2026-08-14T12:51:00-05:00 | Codex | VERTICAL-AP-BILL-INLINE-SURFACES | AP bill exact two-leaf drill evidence + guard | RESERVED | codex/vertical-ap-bill-inline-026 |
| 2026-08-14T12:50:50-05:00 | Codex | VERTICAL-AP-BILL-INLINE-SURFACES | AP bill exact two-leaf drill evidence + guard | RELEASED-ON-MERGE | codex/vertical-ap-bill-inline-026 |
| 2026-08-14T12:54:00-05:00 | Codex | VERTICAL-INVOICE-INLINE-APPLICABILITY | invoice exact two-leaf domain applicability + guard | RESERVED | codex/vertical-invoice-inline-027 |
| 2026-08-14T12:52:58-05:00 | Codex | VERTICAL-INVOICE-INLINE-APPLICABILITY | invoice exact two-leaf domain applicability + guard | RELEASED-ON-MERGE | codex/vertical-invoice-inline-027 |
| 2026-08-14T12:57:00-05:00 | Codex | VERTICAL-BANK-INLINE-APPLICABILITY | bank exact one-leaf direct-source applicability + guard | RESERVED | codex/vertical-bank-inline-028 |
| 2026-08-14T12:54:12-05:00 | Codex | VERTICAL-BANK-INLINE-APPLICABILITY | bank exact one-leaf direct-source applicability + guard | RELEASED-ON-MERGE | codex/vertical-bank-inline-028 |
| 2026-08-14T13:00:00-05:00 | Codex | VERTICAL-INVENTORY-INLINE-APPLICABILITY | OEM reference versus stock applicability + guard | RESERVED | codex/vertical-inventory-inline-029 |
| 2026-08-14T12:55:58-05:00 | Codex | VERTICAL-INVENTORY-INLINE-APPLICABILITY | OEM reference versus stock applicability + guard | RELEASED-ON-MERGE | codex/vertical-inventory-inline-029 |
| 2026-08-14T13:03:00-05:00 | Codex | VERTICAL-UNIT-OEM-REFERENCE | OEM global-reference unit applicability + guard | RESERVED | codex/vertical-unit-oem-030 |
| 2026-08-14T12:57:10-05:00 | Codex | VERTICAL-UNIT-OEM-REFERENCE | OEM global-reference unit applicability + guard | RELEASED-ON-MERGE | codex/vertical-unit-oem-030 |
| 2026-08-14T13:06:00-05:00 | Codex | VERTICAL-TRAILER-OEM-REFERENCE | OEM global-reference trailer applicability + guard | RESERVED | codex/vertical-trailer-oem-031 |
| 2026-08-14T12:58:25-05:00 | Codex | VERTICAL-TRAILER-OEM-REFERENCE | OEM global-reference trailer applicability + guard | RELEASED-ON-MERGE | codex/vertical-trailer-oem-031 |
| 2026-08-14T13:09:00-05:00 | Codex | VERTICAL-CONNECTIVITY-INLINE-ROUTES | two inline surface route hints + mount guard | RESERVED | codex/vertical-connectivity-inline-032 |
| 2026-08-14T13:00:06-05:00 | Codex | VERTICAL-CONNECTIVITY-INLINE-ROUTES | two inline surface route hints + mount guard | RELEASED-ON-MERGE | codex/vertical-connectivity-inline-032 |
| 2026-08-14T13:14:00-05:00 | Codex | VERTICAL-CONNECTIVITY-QBO-CATEGORIES-TMS-CATALOG | product/service category list/create entity membership + guard | RESERVED | codex/vertical-next-033 |
| 2026-08-14T13:03:47-05:00 | Codex | VERTICAL-CONNECTIVITY-QBO-CATEGORIES-TMS-CATALOG | product/service category list/create entity membership + guard | RELEASED-ON-MERGE | codex/vertical-next-033 |
| 2026-08-14T13:20:00-05:00 | Codex | VERTICAL-CONNECTIVITY-REPORTS-HUB | reports registry hub + category/run subnav exact guard | RESERVED | codex/vertical-connectivity-reports-034 |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-REPORTS-RUNNER-ALIASES | reports runner alias connectivity | apps/frontend/src/pages/reports/ReportsRunner.tsx; scripts/verify-reports-runner-canonical-aliases.mjs | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-REPORTS-FLEET-UTILIZATION | reports runner fleet utilization | Reports runner config/library; home fleet-utilization route; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-REPORTS-FUEL-PRICE-VARIANCE | reports runner fuel price variance | Reports runner; reports fuel-price-variance route; fuel transaction label join; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-REPORTS-HOS-VIOLATIONS | reports runner HOS violations | Runner config/table/library; canonical safety HOS route; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-REPORTS-DOT-AUDIT-PACK | reports DOT audit inspection packet | Runner config/library; safety DOT inspection list; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-REPORTS-SAVED-PRESETS | reports saved owner/quarter preset pair | Reports runner aliases; ScheduledReportsPage; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-REPORTS-DETENTION-CLAIMS | reports detention claims | Reports detention route/library/runner; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-SAFETY-DRIVER-PROFILE | safety driver profile panel | DriverSafetyProfile page/panel; mdata aggregate API; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-SAFETY-ELD-AUDIT | safety ELD audit list | ELD viewer service/tests; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-MAINTENANCE-SEVERE-REPAIRS | severe repair work-order lineage | SevereRepairOosTab; trigger migration; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-MAINTENANCE-TIRE-CREATORS | tire record + brand creators | TireProgramPage; tire routes/tests; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-MAINTENANCE-WO-CREATE-MODAL | work-order creator inventory correction | maintenance required/surface inventory; live creator; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-DRIVER-PAY-RATE-TEMPLATES | mounted driver pay-rate catalog connectivity | Drivers page; canonical catalog list/create API; focused guard | ACTIVE |
| 2026-08-14 | Codex | SAFETY-PROFILE-LIST-ERROR-STATUS | preserve HTTP failure status in driver safety profile | DriverSafetyProfilePage; focused guard | ACTIVE |
| 2026-08-14 | Codex | CASH-FLOW-CUSTOMER-ENTITY-PICKER-KIND | canonical shared customer picker/creator | EntityPicker registry and drawer; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-SYSTEM-PROGRAM-CONFIG | code/R2/git-backed System connectivity applicability | System module; program tracker/matrix routes; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-MAINTENANCE-DAMAGE-INTAKE | triage damage/WO dual-create connectivity | TriageModal; maintenance routes/API; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-CONNECTIVITY-INVENTORY-PURCHASE-HOLD | purchase door + honest-empty HOLD disposition | Inventory page/HOLD doc; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-REVERSE-LINK-VENDOR-MASTER-DETAIL | vendor selected-row tab to canonical profile | Vendors page; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-REVERSE-LINK-EXISTING-FK-DRILLS | inventory WO + task activity exact drills | InventoryAssignmentsPage; TaskPlannerGrid; focused guard | ACTIVE |
| 2026-08-14 | Codex | VERTICAL-REVERSE-LINK-MAINTENANCE-SOURCE-WO | DVIR defect/pre-flight/PM alert persisted WO drills | maintenance routes and surfaces; focused guard | ACTIVE |
| 2026-08-24T23:57:29-05:00 | Codex | DISP-LOAD-DRAWER-RESEND-SILENT-FAILURE | apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx, scripts/verify-load-detail-drawer-mutation-errors-surfaced.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/queue-scan |
| 2026-08-25T00:00:00-05:00 | Codex | DISP-LOAD-DRAWER-RESEND-SILENT-FAILURE | — | RELEASED-ON-MERGE | codex/load-drawer-resend-visible-error |
| 2026-08-25T00:08:00-05:00 | Codex | DISPATCH-LOAD-DRAWER-STICKY-TABS-DEAD-CLICK-V2 | apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx, scripts/verify-dispatch-load-deeplink-opens-drawer.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-drawer-scroll-v2 |
| 2026-08-25T00:10:00-05:00 | Codex | DISPATCH-LOAD-DRAWER-STICKY-TABS-DEAD-CLICK-V2 | — | RELEASED-ON-MERGE | codex/drawer-scroll-root-fix |
| 2026-08-25T00:17:39-05:00 | Codex | DISPATCH-BOL-STORED-DOWNLOAD-SILENT-FAILURE | apps/frontend/src/components/dispatch/LoadBolPanel.tsx, scripts/verify-disp-wire-09-bol-generate.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-bol-download-error |
| 2026-08-25T00:20:00-05:00 | Codex | DISPATCH-BOL-STORED-DOWNLOAD-SILENT-FAILURE | — | RELEASED-ON-MERGE | codex/bol-download-visible-error |
| 2026-08-25T00:25:00-05:00 | Codex | DISPATCH-DRIVER-INSTRUCTIONS-DOWNLOAD-URL-JSON-DEAD-END | apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx, scripts/verify-dispatch-load-deeplink-opens-drawer.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-driver-instructions-download |
| 2026-08-25T00:28:00-05:00 | Codex | DISPATCH-DRIVER-INSTRUCTIONS-DOWNLOAD-URL-JSON-DEAD-END | — | RELEASED-ON-MERGE | codex/driver-instructions-signed-download |
| 2026-08-25T00:52:00-05:00 | Codex | DISPATCH-UNIT-STATUS-VIEW-FAILURE-MASKED-AS-404 | apps/backend/src/dispatch/loads.routes.ts, scripts/verify-dispatch-oos-gate-not-view-dependent.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-unit-status-honesty |
| 2026-08-25T00:55:00-05:00 | Codex | DISPATCH-UNIT-STATUS-VIEW-FAILURE-MASKED-AS-404 | — | RELEASED-ON-MERGE | codex/unit-status-honest |
| 2026-08-25T01:04:00-05:00 | Codex | DISPATCH-ETA-SYNTHETIC-TELEMETRY-LABELED-LIVE | apps/backend/src/dispatch/dispatch-refinements.service.ts, apps/backend/src/telematics/dispatch-live-eta.service.ts, apps/frontend/src/api/dispatch.ts, scripts/verify-dispatch-eta-columns.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-eta-honesty |
| 2026-08-25T01:08:00-05:00 | Codex | DISPATCH-ETA-SYNTHETIC-TELEMETRY-LABELED-LIVE | — | RELEASED-ON-MERGE | codex/eta-honesty |
| 2026-08-25T01:23:00-05:00 | Codex | SAFETY-DRIVER-PROFILE-SQL-FAILURE-MASKED-AS-404 | apps/backend/src/safety/driver-profile.routes.ts, scripts/verify-safety-expiry-tracking-coverage.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-safety-profile-honesty |
| 2026-08-25T01:27:00-05:00 | Codex | SAFETY-DRIVER-PROFILE-SQL-FAILURE-MASKED-AS-404 | — | RELEASED-ON-MERGE | codex/safety-profile-honesty |
| 2026-08-25T09:41:00-05:00 | Codex | SAFETY-EVENT-DETAIL-SQL-FAILURE-MASKED-AS-404 | apps/backend/src/safety/safety.routes.ts, scripts/verify-safety-event-detail-list-fallback.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-safety-event-detail |
| 2026-08-25T09:45:00-05:00 | Codex | SAFETY-EVENT-DETAIL-SQL-FAILURE-MASKED-AS-404 | — | RELEASED-ON-MERGE | codex/safety-event-detail-honesty |
| 2026-08-25T09:45:30-05:00 | Codex | SAFETY-ACCIDENT-DETAIL-SQL-FAILURE-MASKED-AS-404 | apps/backend/src/safety/safety.routes.ts, scripts/verify-safety-accident-reverse-deep-link.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-accident-detail-honesty |
| 2026-08-25T09:49:00-05:00 | Codex | SAFETY-ACCIDENT-DETAIL-SQL-FAILURE-MASKED-AS-404 | — | RELEASED-ON-MERGE | codex/accident-detail-honesty |
| 2026-08-25T09:56:00-05:00 | Codex | SAFETY-ACCIDENT-PATCH-PRE-READ-FAILURE-MASKED-AS-404 | apps/backend/src/safety/safety.routes.ts, scripts/verify-accident-create-param-order.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-accident-patch-honesty |
| 2026-08-25T09:59:00-05:00 | Codex | SAFETY-ACCIDENT-PATCH-PRE-READ-FAILURE-MASKED-AS-404 | — | RELEASED-ON-MERGE | codex/accident-patch-honesty |
| 2026-08-25T10:04:00-05:00 | Codex | SAFETY-INCIDENT-AUTO-WORKFLOW-INSERT-FAILURES-SILENT | apps/backend/src/safety/incidents/auto-workflow-trigger.ts, scripts/verify-incidents-work-order-fk.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-incident-workflow-honesty |
| 2026-08-25T10:10:00-05:00 | Codex | SAFETY-INCIDENT-AUTO-WORKFLOW-INSERT-FAILURES-SILENT | — | RELEASED-ON-MERGE | codex/incident-workflow-honesty |
| 2026-08-25T10:15:00-05:00 | Codex | SAFETY-EVENT-LIST-QUERY-FAILURES-FALSE-ALL-CLEAR | apps/backend/src/safety/safety.service.ts, scripts/verify-safety-event-detail-list-fallback.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-safety-events-list-honesty |
| 2026-08-25T10:18:00-05:00 | Codex | SAFETY-EVENT-LIST-QUERY-FAILURES-FALSE-ALL-CLEAR | — | RELEASED-ON-MERGE | codex/safety-events-list-honesty |
| 2026-08-25T10:23:00-05:00 | Codex | SAFETY-DRUG-TEST-LIST-QUERY-FAILURE-FALSE-CLEAR | apps/backend/src/safety/safety.routes.ts, scripts/verify-comp01-drug-alcohol-unified-source.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-drug-test-list-honesty |
| 2026-08-25T10:27:00-05:00 | Codex | SAFETY-DRUG-TEST-LIST-QUERY-FAILURE-FALSE-CLEAR | — | RELEASED-ON-MERGE | codex/drug-test-list-honesty |
| 2026-08-25T10:32:00-05:00 | Codex | SAFETY-CSA-LATEST-QUERY-FAILURE-MASKED-AS-NO-DATA | apps/backend/src/safety/safety.routes.ts, scripts/verify-csa-hazmat-source-integrity.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-csa-latest-honesty |
| 2026-08-25T10:36:00-05:00 | Codex | SAFETY-CSA-LATEST-QUERY-FAILURE-MASKED-AS-NO-DATA | — | RELEASED-ON-MERGE | codex/csa-latest-honesty |
| 2026-08-25T10:42:00-05:00 | Codex | SAFETY-KPI-QUERY-FAILURES-FALSE-ZERO | apps/backend/src/safety/safety.routes.ts, apps/backend/src/safety/foundation-kpis.routes.ts, scripts/verify-safety-dashboard-kpis-wired.mjs, scripts/verify-safety-count-nav-integrity.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-safety-kpi-honesty |
| 2026-08-25T10:47:00-05:00 | Codex | SAFETY-KPI-QUERY-FAILURES-FALSE-ZERO | — | RELEASED-ON-MERGE | codex/safety-kpi-honesty |
| 2026-08-25T10:54:00-05:00 | Codex | DISPATCH-OWNER-OVERRIDE-AUDIT-QUERY-FAILURE-FALSE-EMPTY | apps/backend/src/audit/dispatch-overrides.routes.ts, scripts/verify-owner-override-log-route-wired.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-owner-override-audit-honesty |
| 2026-08-25T10:58:00-05:00 | Codex | DISPATCH-OWNER-OVERRIDE-AUDIT-QUERY-FAILURE-FALSE-EMPTY | — | RELEASED-ON-MERGE | codex/owner-override-audit-honesty |
| 2026-08-25T11:06:00-05:00 | Codex | WORKER-COMPANY-ENUMERATION-FAILURES-FALSE-ZERO | apps/backend/src/jobs/booking-gap-aggregator-worker.ts, apps/backend/src/jobs/geofence-reconciliation-daily.ts, scripts/verify-layover-detector-fails-loud.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-worker-company-census-honesty |
| 2026-08-25T11:11:00-05:00 | Codex | WORKER-COMPANY-ENUMERATION-FAILURES-FALSE-ZERO | — | RELEASED-ON-MERGE | codex/worker-company-census-honesty |
| 2026-08-25T11:18:00-05:00 | Codex | USERS-NOTIFICATION-PREFERENCES-READ-FAILURE-MASKED-AS-DEFAULTS | apps/backend/src/identity/notification-prefs.routes.ts, scripts/verify-notification-preferences-uses-paritytable.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-notification-prefs-honesty |
| 2026-08-25T11:24:00-05:00 | Codex | USERS-NOTIFICATION-PREFERENCES-READ-FAILURE-MASKED-AS-DEFAULTS | — | RELEASED-ON-MERGE | codex/notification-prefs-honesty |
| 2026-08-25T11:52:00-05:00 | Codex | NOTIFICATION-RECIPIENT-CENSUS-FAILURE-FALSE-ZERO | apps/backend/src/notifications/dispatcher.ts, scripts/verify-safety-event-severe-notifications.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-notification-recipient-census |
| 2026-08-25T11:58:00-05:00 | Codex | NOTIFICATION-RECIPIENT-CENSUS-FAILURE-FALSE-ZERO | — | RELEASED-ON-MERGE | codex/notification-recipient-census-honesty |
| 2026-08-25T12:03:00-05:00 | Codex | FUEL-PLANNER-DETAIL-READ-FAILURES-FALSE-EMPTY | apps/backend/src/fuel/planner.routes.ts, scripts/verify-fuel-home-dashboard-wired.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-fuel-planner-detail-honesty |
| 2026-08-25T12:09:00-05:00 | Codex | FUEL-PLANNER-DETAIL-READ-FAILURES-FALSE-EMPTY | — | RELEASED-ON-MERGE | codex/fuel-planner-detail-honesty |
| 2026-08-25T12:17:00-05:00 | Codex | QUICK-ASSIGN-QUALIFICATION-QUERY-FAILURES-FAIL-OPEN | apps/backend/src/dispatch/quick-assign.service.ts, scripts/verify-book-load-driver-qualification-gate.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-quick-assign-qualification-fail-open |
| 2026-08-25T12:23:00-05:00 | Codex | QUICK-ASSIGN-QUALIFICATION-QUERY-FAILURES-FAIL-OPEN | — | RELEASED-ON-MERGE | codex/quick-assign-qualification-fail-open |
| 2026-08-25T12:31:00-05:00 | Codex | DISPATCH-OCR-SCHEDULER-FAILURE-SILENT | apps/backend/src/dispatch/ocr-processor.service.ts, scripts/verify-dispatch-ocr-queue.mjs, docs/audit/GUARD-WORKORDERS.md | RESERVED | codex/reserve-ocr-scheduler-honesty |
| 2026-08-25T12:37:00-05:00 | Codex | DISPATCH-OCR-SCHEDULER-FAILURE-SILENT | — | RELEASED-ON-MERGE | codex/ocr-scheduler-honesty |
| 2026-08-28T07:35:00-05:00 | CC-3 | LV-TXN-017-USMCA-BILL-CREATE-VOID | docs/audit/LIVE-TXN-BATTERY-2026-08-06.md, docs/audit/USMCA-EXHAUSTIVE-BATTERY.md | RESERVED | cc3/live-txn-bill-usmca-20260828 |
| 2026-08-28T07:45:00-05:00 | CC-3 | LV-TXN-017-USMCA-BILL-CREATE-VOID | docs/audit/LIVE-TXN-BATTERY-2026-08-06.md, docs/audit/USMCA-EXHAUSTIVE-BATTERY.md | RELEASED-ON-MERGE | cc3/live-txn-bill-usmca-20260828 |
| 2026-08-28T07:46:00-05:00 | CC-3 | LV-TXN-018-USMCA-INVOICE-NOLOAD-SEND-GATE | docs/audit/LIVE-TXN-BATTERY-2026-08-06.md, docs/audit/USMCA-EXHAUSTIVE-BATTERY.md | RESERVED | cc3/live-txn-invoice-usmca-20260828 |
| 2026-08-28T07:52:00-05:00 | CC-3 | LV-TXN-018-USMCA-INVOICE-NOLOAD-SEND-GATE | docs/audit/LIVE-TXN-BATTERY-2026-08-06.md, docs/audit/USMCA-EXHAUSTIVE-BATTERY.md | RELEASED-ON-MERGE | cc3/live-txn-invoice-usmca-20260828 |
| 2026-08-28T08:00:00-05:00 | CC-3 | LV-TXN-019-USMCA-REVREC-EVENT2-BACKLOG | docs/audit/LIVE-TXN-BATTERY-2026-08-06.md, docs/audit/USMCA-EXHAUSTIVE-BATTERY.md, docs/audit/GUARD-WORKORDERS.md | RESERVED | cc3/live-audit-acct-earn-only-backlog-20260828 |
| 2026-08-28T08:10:00-05:00 | CC-3 | LV-TXN-019-USMCA-REVREC-EVENT2-BACKLOG | docs/audit/LIVE-TXN-BATTERY-2026-08-06.md, docs/audit/USMCA-EXHAUSTIVE-BATTERY.md, docs/audit/GUARD-WORKORDERS.md | RELEASED-ON-MERGE | cc3/live-audit-acct-earn-only-backlog-20260828 |
