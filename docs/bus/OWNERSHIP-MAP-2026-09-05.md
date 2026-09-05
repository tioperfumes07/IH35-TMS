# MODULE OWNERSHIP MAP — owner 'lock it' 2026-09-05 14:13Z

## ★★★★★ OWNER "LOCK IT" — MODULE OWNERSHIP MAP, ONE LEAD, DEPLOY TIMER. PERMANENT (owner 2026-09-05 14:13Z). Supersedes §0b's table where they differ.
**One lead.** Claude (this session) is THE lead: measures live, writes verdicts, keeps the ONE register `docs/bus/OWNER-ISSUE-INVENTORY-2026-09-05.md`, sequences, enforces deadlines/surrenders, journals. No second register. Cursor = deployer + dispatcher (wake-seat loop) + one builder vertical. Seats never self-assign; a seat with no row asks the lead on its OUTBOX.
**One coder per module, owned vertically** (schema → backend → endpoint → screen → guard → live proof). Hard file boundaries below; `.github/CODEOWNERS` + `verify-seat-surface-ownership.mjs` updated in this PR. FIND IT, FILE IT, DO NOT FIX IT still governs outside your module. Money stays in money-tier seats.

| Module (vertical) | Owner | Files (exclusive) | Money |
|---|---|---|---|
| **Dispatch** — board, planners, round trips, book load, driver instructions | **CC-2** | `pages/dispatch/**`, `components/dispatch/**` (except `LoadDetailCostsTab.tsx`), `backend/dispatch/**`, `book-load.service.ts`, `jobs/dispatch-*` | No (reads money) |
| **Shared components — FROZEN single owner** | **CC-2** | `components/parity/ParityTable*`, `components/table/**`, `design/tokens.ts`, `components/layout/sidebar-config.ts`, `docs/design/**`, `scripts/verify-additive-only.mjs` | — |
| **Banking** — matching, categorize, filters, reconciliation, escrow ledger UI | **Cursor** | `pages/banking/**`, `backend/banking/**` | Yes |
| **Load Costs + Accounting read models** — board, Costs-tab register, Bills (incl. driver bills), Invoices (Factored), vendor/customer roll-up views | **CC-1** | `pages/accounting/**`, `backend/accounting/**` (except settlements), `components/dispatch/LoadDetailCostsTab.tsx`, `dispatch/mileage/**`, `lane-mileage.service.ts` | Yes |
| **Customers + Vendors** — lists, landing filter bar, Transactions tabs | **CC-1** | `pages/Customers.tsx`, `pages/customers/**`, `pages/Vendors.tsx`, `pages/vendors/**`, `backend/mdata/customer-*`, `backend/mdata/vendor-*` | Read-only money |
| **Settlements + Escrow + Driver Profile** — driver settlement detail, company settlements, pre-settlements, deductions, escrow views, driver profile tabs | **CC-3** | `pages/driver-finance/**`, `pages/drivers/**`, `pages/Drivers*.tsx`, `backend/driver-finance/**`, `backend/accounting/settlement*`, `backend/accounting/company-settlement*`, `backend/drivers/**` | Yes (money #2) |
| **Seed + Telematics/Geofence/Safety** | **CC-3** | `scripts/seed-settlements-*`, `scripts/verify-usmca-entity-cutover.mjs`, `backend/telematics/**`, `backend/integrations/samsara/**`, `jobs/geofence-*`, `pages/safety/**`, `backend/compliance/**` | Seed only |
| **Maintenance** | **Codex** | `pages/maintenance/**`, `backend/maintenance/**`, `pages/fleet/**` (tables only) | No |
| **Lists / Reports / Planners (BRD)** | **Cascade** | `pages/lists/**`, `pages/reports/**`, `pages/dispatch/planners/**` (BRD-19..23 only, coordinated with CC-2) | No |
| **Deploy + bus dispatch** | **Cursor** | `docs/bus/OUTBOX-CURSOR.md`, `scripts/wake-seat.sh`, Render | — |
| **Law, register, journal, verdicts** | **Lead (Claude)** | `docs/LAW.md`, `docs/bus/INBOX-*.md` tops, `OWNER-ISSUE-INVENTORY-*`, `SEQUENCE-*`, `STATUS-NOW.md` | — |

**Deploy timer (Cursor):** API + FE deployed from tip **every 20 minutes** while any merge is pending, and immediately after a money or crash fix. Post `CURSOR | DEPLOY <api sha>/<fe sha>` each time. A seat never waits for a deploy to post DONE; the lead re-measures after the timer.
**Migration lanes unchanged** (CC-1 00–11Z, Cursor 12–23Z). Every DONE line still carries the §0c measurements.

### ROW TRANSFERS EFFECTIVE NOW (inventory rows in brackets)
- **Cursor → CC-2:** L.0 gate parity + 82 static failures [3] 15:30Z · L.1d sticky th [1] → **CC-1** (Load Costs is CC-1's vertical) 15:30Z · L.4b top bar [8] 16:30Z · L.5 driver settlement detail [11] → **CC-3** 18:00Z · L.6 company settlements FE [12] → **CC-3** 21:00Z. **Cursor takes B.1 banking matcher [18] 19:30Z and B.2 banking filters/design [19] 18:00Z** from CC-2, plus the deploy timer now.
- **CC-1 keeps:** seed slice re-point [5] 14:30Z, S.1 [11] 17:30Z, S.2 [13] 18:30Z, S.3 [14] 19:00Z; **takes V.1 vendors+customers roll-ups [15,16] 18:30Z and K.9 landing filter bar [17] 16:00Z** (from CC-3 / Cascade); D.1–D.4 driver deductions/escrow/earnings [24–26, 36] → **CC-3**.
- **CC-3 keeps:** void 29 [38] 15:00Z, seed 14 + confirm 13558–62, M.3 company settlements backend [12] 20:00Z, DP.3 audit scope [33] 20:30Z; **takes** D.1 20:00Z · D.2 21:00Z · D.3 19:30Z · D.4 21:30Z · L.5 18:00Z · L.6 21:00Z · DP.1 [30–32] and DP.2 [34,35] (driver profile is its module) 19:30Z / 20:30Z.
- **Codex:** X.7 15:00Z · X.8 17:00Z; DP.1/DP.2 leave Codex (module rule). Then maintenance backlog per inventory.
- **Cascade:** K.4–K.7 planners 15:00Z+; K.9 leaves Cascade. K.8 design-law sweep on lists/reports.
- **CC-2:** L.4a-fix [7,37] 15:00Z · L.0 15:30Z · L.4b 16:30Z · 2.2 tokens [23] 17:30Z · then dispatch backlog (C.6–C.10, BRD board items).
**Surrender rule unchanged:** missed deadline → the lead moves the row to the next money-capable seat for money rows, to CC-2 for design rows, to Cascade for list rows.
