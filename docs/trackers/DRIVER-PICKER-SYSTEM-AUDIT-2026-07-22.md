# DRIVER PICKER — SYSTEM-WIDE AUDIT (2026-07-22)

**Owner GO:** createKind/driver nested +Create = **Yes** — canonical chrome = `CreateDriverModal` only (drawer shell when parent is drawer).  
**Block:** **PLUS-DRIVER-SYSTEM** (not money-only) — shared `DriverPickerWithCreate` + specialized hosts inherit.  
**Guard:** `scripts/verify-plus-driver-system-create.mjs` (+ verify-step `1239`).

## Shared component

`apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx` — Combobox + `allowAddNew: "+ Create driver"` + `CreateDriverModal` (limit 200, Active). Use wherever practical. Specialized UIs (`InlineDriverPicker`, `DriverAutocomplete`, `AssignDriverDropdown`) wire CreateDriverModal into the host so consumers inherit.

## Headline (post PLUS-DRIVER-SYSTEM)

| Verdict | Notes |
|---------|-------|
| CANONICAL_CREATE | All must-wire create-worthy surfaces (see guard allowlist) |
| SKIP | Documented below with reason |
| Owner A | DriverDetail / VehicleProfile `qbo_vendor_id` QboCombobox — **unchanged** |

## MUST-WIRE → CANONICAL_CREATE

| Path | How |
|------|-----|
| `components/drivers/DriverPickerWithCreate.tsx` | Shared gold component |
| `components/factoring/DriverAutocomplete.tsx` | `onRequestCreate` → `+ Create driver` (money callers pass it) |
| `components/dispatch/InlineDriverPicker.tsx` | CreateDriverModal in host |
| `pages/dispatch/AssignDriverDropdown.tsx` | CreateDriverModal in host (LoadReassign inherits) |
| `pages/cash-advances/components/CreateAdvanceModal.tsx` | CreateDriverModal |
| `pages/banking/components/forms/ApplyToBillForm.tsx` | DriverPickerWithCreate `shell="drawer"` |
| `pages/driver-finance/SettlementCloseArrivalPage.tsx` | CreateDriverModal |
| `pages/drivers/SettlementDisputeModal.tsx` | CreateDriverModal |
| `pages/driver-finance/components/SettlementDisputesTab.tsx` | DriverPickerWithCreate |
| `pages/banking/components/BankingTransactionsDesignView.tsx` | DriverAutocomplete + CreateDriverModal |
| `pages/banking/components/BankTransactionSplitModal.tsx` | DriverAutocomplete + CreateDriverModal `shell="drawer"` |
| `components/accounting/VendorBillForm.tsx` | Already canonical (CHROME-11) |
| **`components/insurance/ClaimCreateModal.tsx`** | **DriverPickerWithCreate + CreateUnitModal** (insurance example — Law §9) |
| `pages/legal/contracts/UnifiedContractCreatorModal.tsx` | DriverPickerWithCreate / CreateDriverModal |
| `pages/legal/matters/LegalMatterFormFields.tsx` | DriverPickerWithCreate |
| `pages/maintenance/components/CreateWOSectionIdentification.tsx` | DriverPickerWithCreate |
| `pages/drivers/AutoDeductionPolicies.tsx` | DriverPickerWithCreate |
| `pages/drivers/TeamSplitConfig.tsx` | DriverPickerWithCreate ×2 |
| `pages/UserDetail.tsx` | DriverPickerWithCreate |
| `pages/dispatch/components/BookLoadEquipmentSection.tsx` | DriverPickerWithCreate (BookLoadModalV4 inherits) |
| `components/fleet/QuickAssignModal.tsx` | CreateDriverModal / picker |
| `pages/dispatch/components/QuickAssignModal.tsx` | CreateDriverModal / picker |
| `components/safety/AccidentReportDrawer.tsx` | CreateDriverModal / picker |
| `pages/safety/tabs/ComplaintsTab.tsx` | DriverPickerWithCreate |
| `pages/safety/InternalFinesPage.tsx` | create path / FineCreateModal |
| `pages/safety/tabs/DrugAlcoholTab.tsx` | DriverPickerWithCreate |
| `pages/safety/SafetyMeetingsPage.tsx` | DriverPickerWithCreate |
| `pages/safety/TrainingProgramsPage.tsx` | DriverPickerWithCreate |
| `pages/safety/TrainingRecordsPage.tsx` | DriverPickerWithCreate |
| `pages/safety/components/SafetyIncidentsClusterSurface.tsx` | DriverPickerWithCreate |
| `pages/safety/components/HosViolationCreateModal.tsx` | DriverPickerWithCreate (HoursOfService create path) |
| `pages/safety/components/FineCreateModal.tsx` | Already canonical |
| `pages/safety/components/CargoClaimIntakeSurface.tsx` | Already canonical |

## SKIP (explicit — with reason)

| Path | Reason |
|------|--------|
| `DriverEscrowTabContent.tsx` | Filter-only of drivers with existing escrow — no create path |
| `DisputeQueuePage.tsx` | Driver is display column only — no picker |
| `FactoringHome.tsx` | Vendor-merge lookup-only for existing drivers |
| `FilterBar.tsx` / Dispatch filters | FILTER_ONLY |
| `DefectsInboxPage` / `DriverReportsQueuePage` / `RunnerFilters` / `EldAuditTrailViewer` | FILTER_ONLY |
| `TerminateConfirmModal` / `AssignTruckModal` | Wrong UX for nested create |
| `api/mdata.ts` | API client — not a picker |
| `DriverDetail` / `VehicleProfile` QBO fields | Owner **A** — keep QboCombobox |
| `DriverSafetyCards` | Display-only roster cards |
| `HoursOfServicePage.tsx` | Create path = `HosViolationCreateModal` (wired) |
| `HosHistorySection` / `HosViewerSection` | FILTER_ONLY — subject picker for timeline/history |
| `BookLoadModalV4` | Inherits via `BookLoadEquipmentSection` |
| `LoadReassignModal` | Inherits via `AssignDriverDropdown` |
| Expense / Invoice / RecordPayment / JE forms | No driver pickers found |

## Overlap

- **B2-2** limit:200 applied when touching files / via `DriverPickerWithCreate`.
- Never `QuickCreateKind "driver"` — CreateDriverModal only.
- Rule 21 (`.cursor/rules/21-full-system-no-partial-amnesia.mdc`) — no partial money-only amnesia.
