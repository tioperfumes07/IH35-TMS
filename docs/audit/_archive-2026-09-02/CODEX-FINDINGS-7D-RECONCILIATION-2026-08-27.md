# Codex findings reconciliation — 2026-08-20 through 2026-08-27

Scope: every `GUARD-WORKORDERS.md` row that names Codex and a date in the seven-day window, reconciled against `origin/main` commit history and the current source/guards. A stale `OPEN` cell is not treated as evidence.

## Root-cause fixes verified on main

- `BANK-F5987-RECONCILIATION-DETAIL-PHANTOM-MASK-COLUMN` — `dfe4cbbd6f`.
- `BANK-RECON-UNMATCH-CLEARS-ONLY-THREE-OF-SIX-MATCH-KINDS` — `3eba5a5e63`.
- `CLASS-F5973-TRUE-REMAINDER-ACCOUNTING-UNIT-FINANCE` — `57c1de9abb`.
- `CLASS-F5973-TRUE-REMAINDER-FUEL` — `e009bc3f57`.
- `CLASS-F5973-TRUE-REMAINDER-MAINTENANCE` — `3d64be6e15`.
- `DEAD-SCHEMA-CASH-FLOW-SNAPSHOT-CAPTURED-AT-UNREAD` — `ca1f3422de`.
- `DISPATCH-DRIVER-PAY-BILL-DRIVER-HUMAN-LABEL-MISSING` — `3a288f4a1a`.
- `DRIVER-BILLS-VIEW-AUDIT-DUPLICATE-LOAD-NUMBER` — `01537d054a`.
- `DRV-F6002-TEAM-MUTATIONS-UNVALIDATED-COMPANY-GUC` — root fix `86883fef34`; later board row explicitly refutes the stale OPEN.
- `FACT-F5986-CUSTOMER-FACTOR-BATCH-HISTORY-DISTINCT-ORDER-500` — `1934520872`.
- `FUEL-PLANNER-DASHBOARD-SPEND-QUERY-FAILS-AS-ZERO` — `f54d8240fd`.
- `GUARD-F6809A-CLAIM-LOAD-REVERSE-GUARD-REJECTS-TYPED-FILTERS` — PR #16656 / `5c8ab84b09`; mutation selftest 20/20.
- `HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS` — `cc94abc11c`.
- `INS-MONEY-F6810A-RENEWAL-COMMITS-POLICY-BEFORE-BILL-SCHEDULE`, `MAINT-MONEY-F6750A-WARRANTY-REIMBURSE-UPDATE-FALSE-SUCCESS`, `SAFETY-MONEY-F6741-INTERNAL-FINE-LIABILITY-BACKLINK-SILENT-NOOP`, and `SAFETY-MONEY-F6822A-INTERNAL-FINE-NESTED-COMMIT` — root-cause batch `70aa7f438e`; corresponding mutation guards pass in the local gate.
- `INVENTORY-PARTS-ASSIGNMENT-PHYSICAL-DELETE` — `72f83ecfbe`.
- `LISTS-F6704-CATALOG-REGISTRY-EQUIPMENT-CROSS-OPCO-STATS-PREVIEW` — `69f0f23a41`.
- `PARITYTABLE-MISSING-HIDEPAGER-CLASS-SAFETY-POSITION-HISTORY` — `5b02dcf77e`.
- `QBO-CHROME-GUARDS-UNWIRED-CENSUS-DRIFT` — `1998731e0a`.
- `SAFETY-GUARD-F6851A-WAVE-A-UNIT-PAYLOAD-RATCHET-STALE` — current main guard normal PASS and planted-defect selftest 8/8; the OPEN row is stale.
- `TAX-F6293-1099-SHARED-DRIVER-NAME-FALLS-BACK` — `42668cc376`.
- `VENDORS-SELECT-HIDES-DEACTIVATED-DETAIL` — `6c0c54d0df`.

## Genuine unresolved findings — directly routed

These are not called fixed. They require the named root-cause block, not a route-only or UI-only patch.

### CC-1 money/WORM

- `INS-MONEY-F6843A-POLICY-WITH-BILLS-CREATE-MUTABLE-SCOPE-PENDING-DISMISS` — immutable full policy/bill payload and pending-dismiss lifecycle; `PolicyCreateWizard.tsx:306-345,631-669`.
- `MAINT-MONEY-F6803A-ROAD-SERVICE-WO-BILL-DUPLICATE-ORPHAN-RACE` — ticket lock + canonical identities + null-only returning CAS; `maintenance/road-service/wo-integration.ts:43-161`.
- `MAINT-MONEY-F6797-WO-LINE-DELETE-DESTROYS-COST-HISTORY` — migration-backed void/reversal metadata and active-row filtering across totals/AP; `work-orders.routes.ts:1669-1707`, migration `0050`.
- `DRVFIN-F6169-DRIVER-ADVANCES-REJECTS-AUTHORIZED-SHARED-DRIVER` — active selected-company authorization parent gate; `drivers/advances.routes.ts:53-57`.

### CC-3 integrations/schema

- `DEAD-SCHEMA-OUTBOX-QUEUE-EXTERNAL-ID-UNREAD` — wire the canonical external-reference reader or add a precise evidence-backed staged-schema contract; never create QBO write-back.

## Routing proof

The five unresolved items are repeated at the top of `INBOX-CC-1.md` / `INBOX-CC-3.md` with exact file paths, dependencies, and required root fix. `GUARD-WORKORDERS.md` remains the canonical append-only source. No item is marked fixed until its code, mutation guard, merge SHA, and applicable live proof exist.
