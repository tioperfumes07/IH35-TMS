# Deferred Features Tracker (17 items)

| # | ID | Feature | Phase/Block | Priority | Notes |
|---|-----|---------|------------|---------|-------|
| 1 | DRIVER-ESCROW-FULL | Driver Escrow Ledger (full) | Settlement | MVP-ADJACENT | Ties to INVQ9 driver-settlement 1099 |
| 2 | W2-VS-1099 | W2 vs 1099 driver distinction | Settlement/Payroll | MVP-ADJACENT | Required for 1099 reporting; ties to driver-settlement |
| 3 | FIXED-ASSET-DEPRECIATION | Fixed Asset Depreciation Engine | Accounting | P2 | mdata.assets has purchase cost; depreciation fields missing |
| 4 | MEXICO-OPS | Mexico Operations Module | USMCA | P2 | USMCA July 2026 launch |
| 5 | INTERNAL-MECHANIC-SHOP | Internal Mechanic Shop | Maintenance | P2 | |
| 6 | ELD-DRIVER-LINK | ELD direct link from Drivers module | Safety/Drivers | P1 | EldAuditTrailViewer.tsx in Safety; no direct link from Drivers profile |
| 7 | IFTA-COMPLETE | IFTA Reporting (complete) | Tax | P1 | IFTAPreparer.tsx exists; block outstanding |
| 8 | PLAID-INTEGRATION | Plaid bank feed integration | Banking | P2 | Full spec in Phase 5; prod approval pending |
| 9 | QBO-SYNC-WORKER | QBO live sync worker (Block 37) | Accounting | P1 | Schema ready; worker never deployed |
| 10 | ACCT-PERIODS-INIT | accounting.periods initialization Jan–Jun 2026 | Accounting | P1 | 0 rows; period close inert |
| 11 | BALANCE-SHEET | Balance Sheet statement | Accounting B | P1 | Block 13 — not built |
| 12 | CASH-FLOW-STATEMENT | Cash Flow statement | Accounting B | P1 | Block 14 — not built |
| 13 | STATEMENT-EXPORT | Statement export PDF/print | Accounting B | P2 | Block 18 — partial |
| 14 | REVERSAL-VOID-AUDIT | Reversal & void audit sweep | Accounting D | P1 | Block 42 — partial |
| 15 | BANK-RECON-WORKFLOW | Bank reconciliation 3-way match workspace | Banking | P2 | Schema ready; Phase 5 spec |
| 16 | UNIT-FULL-PROFILE | Single-page unit full profile | Operations | P1 | After history/equipment/insurance-safety blocks land |
| 17 | SIDEBAR-NAV-CORRECTION | Remove SidebarFlyoutMenu, replace with tooltip + top-bar sub-nav | UI | P1 | Requires before/after preview approval before any Sidebar.tsx edit |

> Status: DEFERRED — tracking only, not queued for active development.
