# Module completion — Maintenance — acceptance checklist

**PROGRESS: 39 of 39** · complete: `true` · as_of: 2026-08-09T01:50:40.513Z · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 39 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `MAINT-S01` | **PASS** | Surface /maintenance renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — /maintenance + /maintenance/active-wos via MaintenanceHomePage (opco-scoped workOrdersQuery/listWorkOrdersFiltered). WorkOrdersTable ParityTable loading= gate + honest emptyText. Parts inventory already MIGRATED. Guard verify-list-empty-settled WorkOrdersTable entry. Density not required (module note 2026-07-31). | — |
| `MAINT-S02` | **PASS** | Surface /maintenance/active-wos renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — /maintenance + /maintenance/active-wos via MaintenanceHomePage (opco-scoped workOrdersQuery/listWorkOrdersFiltered). WorkOrdersTable ParityTable loading= gate + honest emptyText. Parts inventory already MIGRATED. Guard verify-list-empty-settled WorkOrdersTable entry. Density not required (module note 2026-07-31). | — |
| `MAINT-S03` | **PASS** | Surface /maintenance/arriving-soon renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — ArrivingSoonPage opco-scoped getArrivingSoon; ParityTable loading= settled gate + honest emptyText; error banner (not false-empty); mobile empty uses settled gate. Guard verify-list-empty-settled ArrivingSoonPage entry. | — |
| `MAINT-S04` | **PASS** | Surface /maintenance/brake-wear renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — BrakeWearDashboard opco at-risk query + ParityTable loading + emptyText; verify-list-empty-settled. | — |
| `MAINT-S05` | **PASS** | Surface /maintenance/compliance renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — Compliance425CPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S06` | **PASS** | Surface /maintenance/damage-reports renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — MaintenanceDamageRegisterTab opco + ParityTable loading/emptyText; verify-list-empty-settled. | — |
| `MAINT-S07` | **PASS** | Surface /maintenance/defects renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — DefectsInboxPage opco-scoped listMaintenanceDvirDefects; ParityTable loading=q.isPending + emptyText No DVIR defects. Guard verify-list-empty-settled DefectsInboxPage entry. | — |
| `MAINT-S08` | **PASS** | Surface /maintenance/defects/:defectId renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — DefectDetailPage opco getMaintenanceDvirDefect; loading + honest not-found empty (entity-scoped); triage history. | — |
| `MAINT-S09` | **PASS** | Surface /maintenance/driver-reports renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — DriverReportsQueuePage ParityTable loading/emptyText; verify-list-empty-settled. | — |
| `MAINT-S10` | **PASS** | Surface /maintenance/drivers renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — DriversMasterDataPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S11` | **PASS** | Surface /maintenance/fault-drafts renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — FaultDraftsPage ParityTable loading + dual emptyText; verify-list-empty-settled. | — |
| `MAINT-S12` | **PASS** | Surface /maintenance/fault-rules renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — FaultRulesPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S13` | **PASS** | Surface /maintenance/fleet-table renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — FleetTablePage useListState settled empty (already guarded); verify-list-empty-settled FleetTablePage. | — |
| `MAINT-S14` | **PASS** | Surface /maintenance/in-transit renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — InTransitIssuesTable loading= + emptyText; MaintenanceHome error banner; verify-list-empty-settled. | — |
| `MAINT-S15` | **PASS** | Surface /maintenance/in-transit-issues renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — same InTransitIssuesTable path as S14 (/maintenance/in-transit-issues). | — |
| `MAINT-S16` | **PASS** | Surface /maintenance/inspections renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — InspectionsPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S17` | **PASS** | Surface /maintenance/kpi-dashboard renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — MaintKpiDashboardPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S18` | **PASS** | Surface /maintenance/parts renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — PartsMasterDataPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S19` | **PASS** | Surface /maintenance/parts-inventory renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — PartsInventoryTable loading= + honest emptyText; verify-list-empty-settled. | — |
| `MAINT-S20` | **PASS** | Surface /maintenance/pm-auto-engine renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — PmAutoEnginePage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S21` | **PASS** | Surface /maintenance/pm-schedule renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — PmSchedulePage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S22` | **PASS** | Surface /maintenance/position-history renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — /maintenance/position-history mounts PositionHistoryPage (safety); ParityTable loading + emptyText already list-empty-settled guarded. | — |
| `MAINT-S23` | **PASS** | Surface /maintenance/pre-flight-dvir renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — PreFlightDvirQueue ParityTable loading + per-tab emptyText; verify-list-empty-settled. | — |
| `MAINT-S24` | **PASS** | Surface /maintenance/reports renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — MaintenanceReportsPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S25` | **PASS** | Surface /maintenance/rm-status-board renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — R&M Status Board (MaintenanceHome rm_status_board): opco KPIs + RoadServiceActivePanel + triage/severe bands; honest empty panels. | — |
| `MAINT-S26` | **PASS** | Surface /maintenance/road-service renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — RoadServiceList opco + ParityTable loading/emptyText; verify-list-empty-settled. | — |
| `MAINT-S27` | **PASS** | Surface /maintenance/service-location renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — ServiceLocationPage opco + ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S28` | **PASS** | Surface /maintenance/settings renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — MaintenanceSettingsPage opco get/update settings; loading/error/empty banners; form chrome. | — |
| `MAINT-S29` | **PASS** | Surface /maintenance/severe-repairs renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — SevereRepairOosTab ParityTable loading/emptyText; verify-list-empty-settled. | — |
| `MAINT-S30` | **PASS** | Surface /maintenance/tire-wear renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — TireWearDashboard static emptyText + loading; verify-list-empty-settled. | — |
| `MAINT-S31` | **PASS** | Surface /maintenance/tires renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — TireProgramPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S32` | **PASS** | Surface /maintenance/triage renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — /maintenance/triage aliases to in-transit-issues (InTransitIssuesTable settled empty). | — |
| `MAINT-S33` | **PASS** | Surface /maintenance/vehicles renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — VehiclesMasterDataPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S34` | **PASS** | Surface /maintenance/vendors renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — VendorsPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S35` | **PASS** | Surface /maintenance/vendors/:vendorId renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — VendorDetailPage ParityTable settled empties; verify-list-empty-settled. | — |
| `MAINT-S36` | **PASS** | Surface /maintenance/warranty-claims renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — WarrantyClaimsPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S37` | **PASS** | Surface /maintenance/work-orders renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — WorkOrdersConsoleListPage ParityTable settled empty; verify-list-empty-settled. | — |
| `MAINT-S38` | **PASS** | Surface /maintenance/work-orders/:id renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — WorkOrderDetailPage ParityTables loading= for preview/bills/expenses; EntityLinks F+R (#5062). | — |
| `MAINT-S39` | **PASS** | Surface /maintenance/work-orders/new renders, is entity-scoped, and shows an honest empty state | PASS 2026-08-09 — WorkOrderNewPage opens CreateWorkOrderModal entity-scoped; company-required empty copy. | — |

Desktop audit: —
