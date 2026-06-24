# Office Frontend — Nav → Route → Mounted-Component Map (READ-ONLY recon)

Date: 2026-06-24. Repo: `/Users/jorgemunoz/IH35-TMS-clean`. Scope: `apps/frontend`.

**Why this exists:** the Create-WO bug was "right code, wrong/unmounted path" — two parallel
WO-create components with near-identical names; the live button opened the wrong one for weeks.
This map traces every nav target → route → the component that actually mounts, and flags the
dead / mislabeled / duplicate surfaces that produce that bug class.

Sources:
- Routes: `apps/frontend/src/routes/manifest.tsx` (446 `<Route>` elements; `ROUTES` array).
- Shell: `apps/frontend/src/components/Shell.tsx` (Topbar + Sidebar + `<main>{children}`).
- Sidebar modules: `apps/frontend/src/components/layout/sidebar-config.ts` (`SIDEBAR_ITEM_META`,
  `SIDEBAR_DEFAULT_ORDER`, `getSidebarFlyoutItems`).
- Topbar "+ Create": `apps/frontend/src/components/Topbar.tsx`.
- Maintenance sub-nav: `apps/frontend/src/components/maintenance/MAINTENANCE_NAV_CONFIG.ts`.

All routes (except the public/portal/driver ones) are wrapped by one of:
`ProtectedRoute` (any authed user → `Shell`), `OwnerAdminRoute`, `OwnerSuperAdminRoute`,
`OwnerOnlyRoute` (`manifest.tsx:392-445`). The `Shell` always mounts `Topbar` + `Sidebar` +
the route element as `children` (`Shell.tsx:17-41`).

---

## 1. Top nav — the 15-module sidebar rail → mounted component

The navy 80px rail is `Sidebar.tsx`, fed by `SIDEBAR_ITEM_META` (`sidebar-config.ts:88-135`).
Order = `SIDEBAR_DEFAULT_ORDER` (uniform for all users). NOTE: the rail config defines **more than
the 15 canonical module IDs** (legacy entries like FLEET, DRIVER HUB, COMPLIANCE, INSURANCE, FACT,
LEGAL, TASKS, CASH FLOW, SETTLEMENTS, FINANCE HUB, INVENTORY, USERS, HELP all have metas; visibility
is gated by `visibleRoles` + `NAV_HIDDEN_STUB_IDS`). The canonical-15 mapping:

| Module label | `to` (sidebar-config line) | Route in manifest | Mounted component (file) | FLAGS |
|---|---|---|---|---|
| HOME | `/app/homepage` (`:88`) | `manifest:599` | `QboStyleHomePage` via `QboHomepageRoute` (`pages/home/QboStyleHomePage.tsx`) | NOTE: rail HOME goes to `/app/homepage`, **not** `/home`. `/home` (`:591`) mounts `HomeRoute`→`OwnerHome` or `HomePage` (role-split). Two home surfaces, both live by different paths. |
| MAINT | `/maintenance` (`:93`) | `manifest:1333` | `MaintenanceHomePage` (`pages/maintenance/MaintenanceHome.tsx`) | — |
| ACCTG | `/accounting` (`:109`) | `manifest:2862` | `AccountingHubPage` (`pages/accounting/AccountingHubPage.tsx`) | — |
| BANK | `/banking` (`:111`) | `manifest:1137` | `BankingHomePage` (`pages/banking/BankingHome.tsx`) | — |
| FUEL | `/fuel` (`:96`) | `manifest:1049` | `FuelPlannerHomePage initialTab="home"` (`pages/fuel/FuelPlannerHome.tsx`) | — |
| SAFETY | `/safety` (`:107`) | `manifest:1225` | `SafetyLayout` parent → index redirects to `/safety/safety-events` → `SafetyEventsTab` (`pages/safety/SafetyLayout.tsx` + `tabs/`) | — |
| DRIVERS | `/drivers` (`:98`, labeled "DRIVER PROFILE") | `manifest:711` | `DriversPage` (`pages/drivers/DriversPage.tsx`) | — |
| CUSTOMERS | `/customers` (`:113`) | `manifest:719` | `CustomersPage` (`pages/Customers.tsx`) | — |
| DISPATCH | `/dispatch` (`:97`) | `manifest:993` | `DispatchPage` (`pages/Dispatch.tsx`) | Live board = `DispatchPage`→`DispatchBoard`. See dead `DispatchList` note below. |
| VENDORS | `/vendors` (`:114`) | `manifest:735` | `VendorsPage` (`pages/Vendors.tsx`) | — |
| DOCS | `/docs` (`:118`, Owner/Admin) | `manifest:759` | `DocsHomePage` (`pages/docs/DocsHomePage.tsx`) via `OwnerAdminRoute` | `pages/docs/DocsPage.tsx` is a separate DEAD file (see §4). |
| LISTS | `/lists` (`:115`) | `manifest:1756` | `ListsHubPage` (`pages/lists/ListsHubPage.tsx`) | — |
| REPORTS | `/reports` (`:116`) | `manifest:2455` | `ReportsHomePage` (`pages/reports/ReportsHome.tsx`) | Duplicate `pages/reports/ReportsHub.tsx` (`ReportsHubPage`) is DEAD (see §4). |
| 425C | `/425c` (`:120`) | `manifest:1723` | `Form425CHome` (`pages/form425c/Form425CHome.tsx`); `/form-425c`→redirect | — |
| DRV-APP | `/driver-app` (no dedicated rail meta; reachable route) | `manifest:3275` | `DriverAppLandingPage` (`pages/DriverAppLandingPage.tsx`) | Office landing for the driver PWA. |

### Sidebar flyout sub-links (`getSidebarFlyoutItems`, `sidebar-config.ts:150-250`)
Hover flyouts add quick-links per module; each is a plain `<NavLink to=...>` (no mislabel found).
Representative targets (all resolve to live routes confirmed in §3):
- ACCTG flyout: `/accounting`, `/accounting/invoices`, `/accounting/payments`, `/accounting/factoring`.
- MAINT flyout: maps `MAINTENANCE_MODULE_NAV_LINKS` (`MAINTENANCE_NAV_CONFIG.ts:5-15`): Dashboard
  `/maintenance`, Vehicles `/maintenance/vehicles`, Drivers `/maintenance/drivers`, Parts, Severe
  Repairs, PM Schedule, Inspections, Vendors, Reports, Compliance, Position History.
- BANK flyout: `/banking`, `/banking/reconcile`, `/banking/transfers`, `/fuel`.
- DRIVERS flyout: `/drivers`, `/drivers?subtab=profiles`, `?subtab=settlements`, `?subtab=cash_advances`,
  `/driver-finance/cash-advance-requests`, `?subtab=permits`, `/drivers/messages`, `/drivers/applicants`.
- DISPATCH flyout: 20+ links incl. `/dispatch?view=loads`, `/dispatch/at-risk`, planners, detention,
  OCR queue, POD review, geofencing, alerts, border-crossing, `/accounting/factoring` (Factoring Packets).

### Topbar "+ Create" global menu (`Topbar.tsx:224-247`)
The green "+ Create" dropdown (office only) navigates — it does NOT open modals:
| Menu item | navigates to | Mounted |
|---|---|---|
| Invoice | `/accounting/invoices` | `InvoicesListPage` |
| Bill | `/accounting/bills/vendor` | `VendorBillCreatePage` |
| Expense | `/accounting/expenses` | `ExpenseCreatePage` |
| Receive payment | `/accounting/payments` | `PaymentsListPage` |
| Journal entry | `/accounting/journal-entries` | `ManualJEListPage` |
| Bill payment | `/accounting/bill-payments` | `BillPaymentsListPage` |

**There is NO "Work Order" entry in the Topbar + Create menu** — WO creation is reached only from
within MAINT / Home Quick Actions / fleet ActionBars (see §2). The Topbar "Tasks" button
(`Topbar.tsx:250-261`) navigates to `/tasks` (`TaskBoardPage`).

---

## 2. Work Order create surfaces — full resolution (the bug-class focus)

Every component that looks like a WO create/edit surface, and whether it is mounted/reachable:

| Component (file) | Kind | Reachable? | From where | Verdict |
|---|---|---|---|---|
| **`pages/maintenance/components/CreateWorkOrderModal.tsx`** | Full create modal (the real one) | **YES — LIVE** | Imported by 4 live surfaces: `MaintenanceHome.tsx:30` (3 triggers: `:206`, `:258`, `:390` → `setCreateWoOpen(true)`, rendered `:415`); `pages/home/QuickActionsBar.tsx:9,85`; `pages/maintenance/WorkOrderNewPage.tsx:4`; `pages/maintenance/DefectDetailPage.tsx:8` | **THE canonical live WO-create modal.** Footer button label varies by payment timing: "Create work order & Bill" / "& Expense" / "Create work order" (`CreateWorkOrderModal.tsx:725`). |
| **`pages/maintenance/WorkOrderCreateModal.tsx`** | Inline cost-panel (despite the name) | **NO — DEAD** | Imported by ZERO files (grep `import.*WorkOrderCreateModal` → only its own def). Header self-describes `@ModalNoX — inline WO cost panel embedded in CreateWorkOrderModal` but the live `CreateWorkOrderModal` does **not** import it. | **ORPHANED.** Exact name-collision trap: `WorkOrderCreateModal` vs `CreateWorkOrderModal`. This is the dead twin. |
| `pages/maintenance/WorkOrderNewPage.tsx` | Route page (deep-link wrapper) | YES | `manifest:1289` route `/maintenance/work-orders/new` (also fleet ActionBar `?unit_id=`) | LIVE. Just opens `CreateWorkOrderModal` with `initialValues.unit_id`, redirects to `/maintenance` on close. |
| `pages/maintenance/WorkOrderDetailPage.tsx` | Route page (detail/edit) | YES | `manifest:1297` route `/maintenance/work-orders/:id` | LIVE (detail, not create). |
| `pages/work-orders/WorkOrdersConsoleListPage.tsx` | Route page (console list) | YES | `manifest:1325` `/maintenance/work-orders` + `manifest:1732` `/work-orders` | LIVE — two paths mount the same console list. |
| `pages/work-orders/WorkOrdersConsoleDetailPage.tsx` | Route page (console detail) | YES | `manifest:1740` `/work-orders/:id` | LIVE. |
| `components/maintenance/WorkOrderDetailModal.tsx` | Detail modal | YES | Used inside maintenance surfaces (not a create form) | LIVE (detail). |
| `components/work-orders/WorkOrderDetailModal.tsx` | Detail modal (2nd copy) | check | Parallel file to the above — DUPLICATE detail-modal name across two dirs | **DUPLICATE-suspect** — two `WorkOrderDetailModal.tsx` in different dirs; confirm which is wired before editing either. |
| `pages/maintenance/components/QuickActionsBar.tsx` | "+ Create Work Order" button (maintenance) | YES | Rendered in `MaintenanceHome`; `onCreate(type)` → parent's `setCreateWoOpen(true)` → opens **`CreateWorkOrderModal`** | LIVE, correctly wired to the live modal. |
| `pages/home/QuickActionsBar.tsx` | "+ Create WO" button (Home/QBO homepage) | YES | `:39-85` opens **`CreateWorkOrderModal`** | LIVE, correctly wired. |
| `pages/maintenance/components/ConvertIssueToWOModal.tsx` | "+ Create Work Order" (convert issue) | YES | Maintenance issue flow | LIVE (distinct concept — convert, not blank create). |
| `pages/maintenance/components/WorkOrdersTable.tsx` | Table | YES | Maintenance | LIVE (list). |
| `pages/maintenance/components/CreateWOSection*.tsx` (Identification / CostBreakdown / RenderV5Header / PaymentTiming / Reconcile) | Sub-sections of the live modal | YES | imported by `CreateWorkOrderModal.tsx` | LIVE sub-sections. EXCEPT `CreateWOSectionCostBreakdown.tsx` flagged DEAD by component scan — verify (it imports the `CreateWOFormValues` type but may not be rendered). |

**WO-create resolution (one line):** The LIVE create modal is
`apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx`, reached from MAINT
QuickActionsBar, Home QuickActionsBar, `/maintenance/work-orders/new`, and DefectDetail. The
DEAD/orphaned twin is `apps/frontend/src/pages/maintenance/WorkOrderCreateModal.tsx` (zero
importers; it is actually an inline cost panel, not a dialog). Any "Create Work Order" button that
ever pointed at `WorkOrderCreateModal` would render nothing — that is the trap. All current
buttons correctly target `CreateWorkOrderModal`. **Fleet ActionBar buttons** ("+ Create WO" in
`components/trailer-profile/ActionBar.tsx:27`, "+ Create Work Order" in
`components/vehicle-profile/ActionBar.tsx:32`) deep-link to `/maintenance/work-orders/new` →
`WorkOrderNewPage` → live modal — correct.

---

## 3. Route table — path → wrapper → mounted component

Indirections resolved: `MaintenanceTabRoute tabId=X`→`MaintenanceHomePage initialTab=X`;
`DriversSubtabRoute subnav=X`→`DriversPage initialSubnav=X`; `FactoringTabRoute tabId=X`→
`FactoringHomePage initialTab=X`; `FuelTabRoute tabId=X`→`FuelPlannerHomePage initialTab=X`;
`DispatchSecondaryTabRoute subTab=X`→`DispatchPage initialSubTab=X`; `DispatchLoadsRoute`→
`DispatchPage loadsDeepLink`. Wrapper column: `P`=ProtectedRoute, `OA`=OwnerAdminRoute,
`OSA`=OwnerSuperAdminRoute, `OO`=OwnerOnlyRoute, `pub`=public/none, `→`=Navigate redirect.

### Public / auth / portal / driver-PWA (manifest:567-590, 3283-3293)
| Path | Wrap | Mounts |
|---|---|---|
| `/` | pub | `RootRedirect` → `/home` or `/login` |
| `/login`, `/login/reset`, `/login/reset/confirm` | pub | `LoginPage`, `LoginResetRequestPage`, `LoginResetConfirmPage` |
| `/legal/privacy`, `/legal/terms` | pub | `PrivacyPolicyPage`, `TermsOfServicePage` |
| `/sign/:token`, `/attorney-review/:token`, `/owner-approval/:token`, `/apply/:token` | pub | `LegalSignPage`, `LegalAttorneyReviewPortalPage`, `OwnerApprovalPortalPage`, `ApplicationPage` |
| `/portal/*` | PortalRouteGuard | `PortalLayout` → dashboard / `loads/:id` / profile |
| `/pwa/fuel-receipt` | pub | `DriverShell` → `FuelReceiptPage` |
| `/driver`, `/driver/login` | pub | `DriverShell` → loads / loads/:id / hos / disputes / settings; `DriverLoginPage` |

### Core office (manifest:591-1224) — selected
| Path | Wrap | Mounts |
|---|---|---|
| `/home` | P | `HomeRoute` → `OwnerHome` (Owner) or `HomePage` |
| `/app/homepage` | P | `QboHomepageRoute` → `QboStyleHomePage` |
| `/settings`, `/settings/notifications` | P | `UserProfileSettingsPage`, `NotificationPreferencesPage` |
| `/users`, `/users/:id` | P | `UsersPage`, `UserDetailPage` |
| `/drivers` (+ `/drivers/profiles|settlements|pre-settlements|cash-advances|permits|pay-rate-templates|deductions|disputes|leave`) | P | `DriversPage` (subnav variants via `DriversSubtabRoute`) |
| `/customers`, `/customers/:id` | P | `CustomersPage`, `CustomerDetailPage` |
| `/vendors`, `/vendors/:id` | P | `VendorsPage`, `VendorDetailPage` |
| `/documents` | P | `DocumentsPage` |
| `/docs` | OA | `DocsHomePage` |
| `/eld` | OO | `EldPage` |
| `/cash-flow` | P | `CashFlowPage` |
| `/driver-hub`, `/driver-hub/reporting` | P | `DriverHubPage`, `DriverHubReportingPage` |
| `/dispatch` | P | `DispatchPage` |
| `/dispatch/loads` | P | `DispatchPage loadsDeepLink`; `/dispatch/loads/:id`→redirect `?load_id=` |
| `/dispatch/book-load|assignments|settlements|pre-settlements` | P | `DispatchPage initialSubTab=...` |
| `/dispatch/at-risk|in-transit-issues|assignment-history` | P | `AtRiskQueuePage`, `InTransitIssuesPage`, `AssignmentHistoryPage` |
| `/dispatch/planners`, `.../timeline|driver|truck|loads` | P | `DispatchPlannersLayout` wrapping `UnifiedTimelinePlanner`/`DriverPlanner`/`TruckPlanner`/`LoadsPlanner`; `/dispatch/planner`→`PlannerCalendarPage` |
| `/dispatch/detention|equipment-transfers|ocr-queue|notify-preferences|pod-review|settings|alerts|map|geofencing` | P | resp. `DetentionBoardPage`, `EquipmentTransferRequestsPage`, `OcrQueuePage`, `NotifyPreferencesPage`, `PodReviewPage`, `DispatchSettingsPage`, `DispatchAlertsPage`, `MapView`, `GeofencesPage` |
| `/dispatch/alerts/late-arrivals` | P | `LateArrivalsPage` |
| `/dispatch/border-crossing[/history]`, `/dispatch/borders/geofence-history` | P | `BorderCrossingWizardPage`, `BorderCrossingHistoryPage`, `GpsBorderCrossingHistory` |
| `/dispatch/incidents`→`/dispatch/alerts`; `/dispatch/factoring-packets`→`/accounting/factoring` | P→ | redirects |
| `/dispatch/trip-pairing` | P | `TRIP_PAIRING_BOARD_ROUTE.component` (indirect const) |
| `/daily-tasks` | P | `DailyTasksPage` |
| `/fuel`, `/fuel/planner|inbox|settings|expense-mapping|history|loves-prices|compliance` | P | `FuelPlannerHomePage initialTab=...` |
| `/banking`, `/banking/transactions|driver-escrow|reports` | P | `BankingHomePage [initialTab]` |
| `/banking/transfers|reconcile|reconciliation|reconciliation-workspace|categorization-rules|qbo-sync-queue|email-queue` | P | resp. `TransfersListPage`, `BankingObligationReconcilePage`, `BankReconciliationPage`, `ReconciliationWorkspacePage`, `CategorizationRulesPage`, `QboSyncQueuePage`, `EmailQueuePage` |
| `/banking/accounts/:id` | P | `BankAccountDetailPage` |

### Compliance / notifications / safety / maintenance (manifest:1209-1602)
| Path | Wrap | Mounts |
|---|---|---|
| `/compliance` | P | `ComplianceDashboardPage` — **DUPLICATE route** (also at `:3455`) |
| `/notifications` | P | `NotificationCenterPage` — **DUPLICATE route** (also at `:3463`) |
| `/safety` (parent `SafetyLayout`) | P | index→`/safety/safety-events`; ~40 nested tabs: `driver-files`, `drug-alcohol`, `safety-meetings`, `training/programs|records`, `hos`, `eld/audit-trail`, `hos/exceptions`, `hos-violations`, `idvr`, `dot-inspections`, `driver-scoring`, `csa-score`, `dot-compliance`, `safety-events`, `accidents`, `damage-reports`, `trailer-interchanges`, `cargo-claims`, `internal-fines`, `external-fines`, `complaints`, `escrow-record`, `geofence-alerts`, `insurance[/*]`, `permits`, `integrity-reports`, `position-history`, `integrity-alerts`, `audit-425c`, `reports`, `driver-profiles/:driverId`, `driver-scheduler`, `scheduler/pending-requests`, `scheduler/requests/:id`, `leave-balances`, `settings`; `vehicle-inspections`→`/safety/idvr` |
| `/liabilities` | P | `LiabilitiesHomePage` |
| `/maintenance` | P | `MaintenanceHomePage` |
| `/maintenance/work-orders/new` | P | `WorkOrderNewPage` (→ live `CreateWorkOrderModal`) |
| `/maintenance/work-orders/:id` | P | `WorkOrderDetailPage` |
| `/maintenance/work-orders` | P | `WorkOrdersConsoleListPage` |
| `/maintenance/defects`, `/maintenance/defects/:defectId` | P | `MaintenanceShell`→`DefectsInboxPage` / `DefectDetailPage` |
| `/maintenance/active-wos|fleet-table|rm-status-board|service-location|in-transit-issues|in-transit|triage|damage-reports|severe-repairs|road-service|parts-inventory|settings|arriving-soon` | P | `MaintenanceHomePage initialTab=...` |
| `/maintenance/vehicles|drivers|parts|pm-schedule|pm-auto-engine|kpi-dashboard|inspections|tires|warranty-claims|vendors|vendors/:vendorId|reports|compliance|position-history|fault-drafts|fault-rules` | P | resp. master-data / console pages (mostly via `MaintenanceShell`) |

### Factoring / 425C / lists / catalogs (manifest:1603-2398)
| Path | Wrap | Mounts |
|---|---|---|
| `/cash-advances` | P | `CashAdvancesHomePage` |
| `/factoring` + `/factoring/recourse-pipeline|chargebacks-fees|statements-settings|faro-imports|equipment-loans|vendor-merges` | P | `FactoringHomePage [initialTab]` |
| `/factoring/batches/new|:id`, `/factoring/factors|reserves|faro-import` | P | `BatchWizard`, `FactoringBatchDetailRoute`, `FactorAdmin`, `ReserveDashboard`, `FaroImportPage` |
| `/driver-finance/settlements|cash-advance-requests` | P | `SettlementsPage`, `CashAdvanceRequestsPage` |
| `/425c`, `/form-425c`→`/425c` | P | `Form425CHome` |
| `/work-orders`, `/work-orders/:id` | P | `WorkOrdersConsoleListPage`, `WorkOrdersConsoleDetailPage` |
| `/catalogs`→`/lists`; `/lists` | P | `ListsHubPage` |
| `/lists/names[/brokers]` | P | `NamesMasterHub`, `BrokersListPage` |
| `/lists/dispatch/*`, `/lists/driver/*`, `/lists/drivers/*`, `/lists/maintenance/*`, `/lists/fuel/*`, `/lists/fleet/*`, `/lists/accounting/*`, `/lists/safety/*` | P | ~90 individual `*ListPage`/`Catalog` components (full list in manifest:1780-2356) |
| `/lists/accounting/abandonment-defaults` | OA | `AbandonmentDefaultsPage` |
| legacy underscore `/lists/...` paths | P | `UnderscoreLegacyRedirect` (hyphen canonical) |
| `/lists/:domain`, `/lists/:domain/:catalogKey` | P | `ListsDomainRoute` / `ListsCatalogKeyRoute` → redirect or `ComingSoonPage` |
| `/coming-soon` | P | `ComingSoonPage` |
| `/integrations/samsara` | OO | `SamsaraIntegrationPage` |
| `/samsara/vendor-mapping-integrity` | P | `VendorMappingResolutionPage` |

### Help / reports / legal / admin (manifest:2415-2861)
| Path | Wrap | Mounts |
|---|---|---|
| `/help`, `/help/overview|runbooks|:slug` | P | `HelpCenterPage`, `HelpPage`, `RunbooksIndex`, `HelpArticlePage` |
| `/onboarding` | P | `OnboardingWizard` |
| `/reports` | P | `ReportsHomePage` |
| `/reports/ifta|ifta-preparer` | P | `IFTAPreparer` (ifta dir), `IftaPreparer` (tax-regulatory dir) — **two IFTA components, both routed** |
| `/reports/ar-aging|ap-aging|trial-balance|profit-loss|balance-sheet|cash-flow-statement|cash-flow|per-truck-cpm|cash-flow-overview|settlement-summary|customer-profitability|profit-per-truck|lane-profitability|cancellations|fuel-reconciliation|maintenance-cost-per-unit|dispatch-margin|geofence-dwell|geofence-reconciliation|booking-gap|deadhead|scheduled` | P | one report page each |
| `/qbo/sync-dashboard` | P | `QboSyncDetailPage` |
| `/reports/run/:reportId` | P | `ReportsRunnerPage` |
| `/reports/audit/*` (7) | OA | Audit* pages |
| `/legal`, `/legal/contracts|templates|templates/:id|policies|attorney-review` | OA | Legal* pages |
| `/legal/matters[/new|/:id]`, `/legal/reports` | P | `LegalMattersListPage`, `LegalMatterNewPage`, `LegalMatterDetailPage`, `LegalReportsLandingPage` |
| `/admin/data-import|carrier-bootstrap|launch-toggles|feature-flags|forensic-review|observability|mobile-audit` | OA | resp. admin pages |
| `/admin/activity|audit-events|audit-log`, `/audit/trail` | OSA | `ActivityLogPage`, `AuditEventsList`, `AuditLogViewer`, `AuditTrailPage` |
| `/admin/migration-status|error-monitor|integrity` | OO | `MigrationStatusPage`, `ErrorMonitorPage`, `IntegrityAdminPage` |

### Accounting + remainder (manifest:2862-3497)
| Path | Wrap | Mounts |
|---|---|---|
| `/accounting` | P | `AccountingHubPage` |
| `/accounting/vendors→/vendors`, `/customers→/customers`, `/reports→/reports`, `/maintenance-shop→/maintenance` | P→ | redirects |
| `/accounting/invoices[/:id]`, `/payments[/:id]`, `/factoring[/:id]`, `/multi-entity`, `/dispute-queue`, `/abandonment-queue`, `/factor-reconciliation`, `/reconciliation`, `/sales-tax`, `/month-close`, `/audit-trail`, `/posting-lineage`, `/escrow`, `/cash-forecast`, `/period-comparison`, `/pre-settlements`, `/payroll`, `/vendor-balances`, `/account-register`, `/journal-entries[/:id]`, `/bill-payments`, `/qbo-sync`, `/settings/expense-category-map`, `/settings/coa-roles`, `/integration-transactions`, `/receipts`, `/revenue-recognition`, `/fixed-assets`, `/prepaid-expenses`, `/my-accountant` | P | one accounting page each |
| `/accounting/bills` | P | `BillsPage`; `/bills/maintenance|repair|fuel|driver`→redirect `?category=`; `/bills/vendor`→`VendorBillCreatePage`; `/bills/multiple`→`CreateMultipleBillsPage` |
| `/accounting/expenses` | P | `ExpenseCreatePage` |
| `/accounting/accounts-payable` | P | `AP_AGING_ROUTE.component` (indirect const) |
| `{COLLECTIONS_ROUTE.path}` | P | `COLLECTIONS_ROUTE.component` (indirect const) |
| `/accounting/recurring-transactions` | P | `ComingSoonPage` |
| `/driver-app` | P | `DriverAppLandingPage` |
| `/catalogs/equipment-types|driver-load-statuses` | P | `EquipmentTypesPage`, `DriverLoadStatusesPage` |
| `/catalogs/accounts|items`→`/coming-soon`; `/catalogs/classes|payment-terms|posting-templates|account-role-bindings`→`/lists/accounting/...` | P→ | redirects |
| `/drivers/onboarding/:session_id|:id|applicants|messages|retention|alerts|:id/profile|:id/hos` | P | `OnboardingWizardPage`, `DriverDetailPage`, `ApplicantsPipelinePage`, `MessagesInboxPage`, `RetentionDashboard`, `DocumentAlertsPage`, `DriverProfilePage`, `DriverHosDetailPage` |
| `/fleet`, `/fleet/transfers-in-progress`, `/fleet/units/:id`, `/fleet/trailers/:id` | P | `FleetHomePage`, `TransfersInProgressPage`, `VehicleProfilePage`, `TrailerProfilePage` |
| `/compliance` (DUP), `/notifications` (DUP) | P | `ComplianceDashboardPage`, `NotificationCenterPage` (second declarations — first wins in React Router) |
| `/dev/bulk-demo` | P | `BulkDemoPage` |
| `/tasks[/calendar|mine|chat|report]` | P | `TaskBoardPage`, `TasksCalendarPage`, `TasksMinePage`, `TasksChatPage`, `TasksReportPage` |
| `/finance[/projections|scenarios|loan-wizard|calculator|amortization]` | P | `FinanceOverviewPage` + finance pages |
| `/inventory[/assignments|purchases]` | P | `InventoryPartsStockPage`, `InventoryAssignmentsPage`, `InventoryPurchasesPage` |
| `*` (catch-all) | → | redirect to `/` |
| `/insurance` | → | redirect to `/safety/insurance` |

---

## 4. Dead / orphaned components (candidates for ARCHIVE per §7 — never auto-delete)

Method: built the universe of non-test `.tsx` under `apps/frontend/src/pages`, cross-checked each
exported identifier against all imports in `apps/frontend/src` (manifest has NO lazy/dynamic imports,
so static analysis is authoritative). DEAD = zero non-self/non-test importers AND no barrel re-export.

### High-value duplicate-surface / mislabeled deads (the bug-class ones)
| File | Export | Why it matters |
|---|---|---|
| `pages/maintenance/WorkOrderCreateModal.tsx` | `WorkOrderCreateModal` | **THE WO trap.** Name collides with the live `CreateWorkOrderModal`; zero importers; is actually an inline cost panel, not a dialog. |
| `pages/dispatch/LoadCreateModal.tsx` | `LoadCreateModal` | `@ModalNoX` embedded panel; claimed parent does not import it. Dispatch superseded by BookLoad v4 surface. |
| `pages/dispatch/book-load/BookLoad.tsx` | `BookLoad` | Superseded by `BookLoadModalV4`. Dead. |
| `pages/dispatch/components/BookLoadModalV3.deprecated.tsx` | `BookLoadModalV3Deprecated` | Dead but **intentionally preserved** (INVARIANT #24 — "delete only after MVP + 30 days"). DO NOT remove. |
| `pages/reports/ReportsHub.tsx` | `ReportsHubPage` | Duplicate of the routed `ReportsHome`/`ReportsHomePage`. |
| `pages/accounting/ChartOfAccounts.tsx` | `ChartOfAccounts` | Orphan wrapper around the routed `ChartOfAccountsListPage`. |
| `pages/qbo/QBOSyncStatusDashboardPage.tsx` | `QBOSyncStatusDashboardPage` | Duplicate of routed `QBOSyncDriftDashboard`/`QboSyncDetailPage`. |
| `pages/legal/PrivacyPolicy.tsx` | `PrivacyPolicy` | Duplicate of routed `PrivacyPolicyPage`. |
| `pages/safety/SafetyHome.tsx` | `SafetyHomePage` | Superseded by routed `SafetyLayout`. |
| `pages/admin/AdminPage.tsx` | `AdminPage` | Tile-hub; `/admin/*` sub-pages routed individually, hub never imported (no `/admin` route). |
| `pages/payroll-integration/PayrollIntegrationPage.tsx` | `PayrollIntegrationPage` | Header claims `Route: /payroll-integration` but manifest never imports it (merged-not-live). |
| `pages/profitability/ProfitabilityPage.tsx` | `ProfitabilityPage` | Orphan parent of By*View children; route uses other surface. |
| `pages/docs/DocsPage.tsx` | `DocsPage` | DOCS module routes to `DocsHomePage`, not this. |
| `components/work-orders/WorkOrderDetailModal.tsx` vs `components/maintenance/WorkOrderDetailModal.tsx` | both `WorkOrderDetailModal` | DUPLICATE detail-modal name across two dirs — confirm the wired one before editing. |

### Correction to prior MEMORY note
`DispatchList.tsx` is at `components/dispatch/DispatchList.tsx` (NOT `pages/dispatch/`), and it is
**NOT fully dead** in the current tree: `DispatchBoard.tsx:23` imports `DispatchListProps` from it.
The earlier "DispatchList.tsx unmounted dead board" memory appears stale or referred to a
since-removed file. The live dispatch board is `DispatchPage`→`DispatchBoard`.

### Reports category pages — all 9 DEAD (superseded by `ReportCategoryHoverNav`)
`pages/reports/categories/{ops-dispatch,multi-company,tax-reg,safety,equipment,accounting,vendors,driver-perf,customers}.tsx`.

### Other confirmed DEAD (zero importers) — grouped
- **Accounting (FINANCIAL — §1.4 gating if touched):** `QboAccountingSubNav.tsx`,
  `bill-payments/BillPaymentPage.tsx`, `bills/RecurringBillList.tsx`, `bills/RecurringBillCreate.tsx`,
  `ItemsCatalog.tsx`, `BillDetailPanel.tsx`.
- **Banking (FINANCIAL):** `BankTxCategorizationPage.tsx`, `RecordTransferModal.tsx`,
  `components/{BankingKpiRow,CategorizeDrawer,RegisterTable,AccountTilesRow,SyncStatusStrip,BankingReviewCenter}.tsx`.
- **Dispatch:** `LoadCancellationsReportPage.tsx`, `FactoringQueuePage.tsx`, `TripProfitability.tsx`,
  `cargo-sensors/CargoSensorTimeline.tsx`, `assignments/AssignmentEdit.tsx`,
  `components/{LoadTable,UnitsWithoutLoadTable}.tsx`, `components/book-load-v4/TimeWindowDropdown.tsx`,
  `planners/PlannerRangeToolbar.tsx`.
- **Maintenance:** `tires/TireWearDashboard.tsx`, `brakes/BrakeWearDashboard.tsx`,
  `units/{UnitBrakesTab,UnitTiresTab}.tsx`, `pre-flight/PreFlightDvirQueue.tsx`,
  `severe-repairs/SevereRepairEstimateModal.tsx`,
  `components/{SevereAlertsBand,InTransitTriageBand,WODetailDrawer,CreateExpenseModal,CreateBillModal,CreateWOSectionCostBreakdown}.tsx`.
- **Safety:** `CSAMitigationQueue.tsx`, `CSAScore.tsx`, `HarshEventDetail.tsx`, `tabs/AnomaliesTab.tsx`,
  `anomaly/AnomalyDashboard.tsx`, `drug-alcohol/{DrugAlcoholPoolPage,DrugAlcoholProgramTab}.tsx`,
  `components/FineEntryForm.tsx`, `damage-reports/DamageReportDetail.tsx`,
  `photo-comparison/SessionDetail.tsx`.
- **Lists/catalogs:** `lists/{GenericCatalogPage,MaintenanceServicesCatalog,MaintenancePartsCatalog,CatalogIndex}.tsx`,
  `lists/dispatch/DispatchCatalogModal.tsx`, `CatalogsHubPage.tsx`.
- **Other:** `fuel/fraud-alerts/FraudAlertsList.tsx`, `fuel/FuelTransactionsTable.tsx`,
  `driver-finance/EscrowDeductionsPendingTab.tsx`, `drivers/DriverLayoverHistory.tsx`,
  `units/UnitDetail.tsx`, `integrations/edi/{EdiTransactionLog,EdiSetupWizard}.tsx`,
  `admin/{LaunchReadinessPage,QboVendorLinkagePage}.tsx`, `insurance/PaymentScheduleTab.tsx`,
  `reports/{ScheduledReportsPage,LateArrivalReport}.tsx`, `reports/form-425c/ExhibitsViewer.tsx`.

### Caveats
- DEAD = unreachable from the import graph within `apps/frontend/src` only (not `apps/driver-pwa`).
- Per §7 ADDITIVE-ONLY / ARCHIVE-never-DELETE, several deads are intentional archives — this is a
  **review candidate list, not an auto-delete list**. Finance-adjacent deads (`accounting/*`,
  `banking/*`) fall under §1.4 gating if any change is proposed.

---

## 5. Mislabeled-handler / duplicate-route flags summary
- **Mislabeled (bug-class):** none currently LIVE — all "Create Work Order" buttons correctly target
  the live `CreateWorkOrderModal`. The risk component (`WorkOrderCreateModal`) exists but is
  unwired (the trap is latent, not active).
- **Duplicate ROUTES (same path declared twice):** `/compliance` (`manifest:1209` & `:3455`),
  `/notifications` (`:1217` & `:3463`). React Router uses the first match; the second is shadowed.
- **Duplicate component NAMES across dirs:** `WorkOrderDetailModal.tsx` (components/maintenance vs
  components/work-orders); `IFTAPreparer`/`IftaPreparer` (both routed at `/reports/ifta` and
  `/reports/ifta-preparer`); two Home surfaces (`/home`=`HomeRoute`, `/app/homepage`=`QboStyleHomePage`),
  rail HOME points at `/app/homepage`.
- **Same component, multiple paths (intentional):** `WorkOrdersConsoleListPage` (`/maintenance/work-orders`
  + `/work-orders`); `ComingSoonPage` (`/coming-soon`, `/accounting/recurring-transactions`, lists fallbacks).
