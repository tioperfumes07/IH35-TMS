# CC-3 — FINAL-3 (10-25-2026 6:00 PM CT) · 10 rows + popups half · law: 10-25-2026-ALL-CODERS-FINAL-3-LAW.md

Measured against origin/main 5:40 PM. First finish 443.355 item 1 (Book Load side panel) if not merged. Then top to bottom:

| Row | Item | Done = |
|---|---|---|
| 443.365-A (yours) | 19 hand-built overlays -> shared `<Modal>` (decision = size="sm") or `<ParityDrawer>` | your files: components/dispatch/LoadDetailDrawer, components/dispatch/LoadStopsRecordTab, components/dispatch/tabs/FactoringTab, components/driver-inbox/DriverInbox, components/reports/SubscriptionEditor, pages/compliance/HosTrackerSection, pages/dispatch/NeedsDeliveryAuthorizationPage, pages/dispatch/components/BookLoadModalV4, pages/dispatch/components/book-load-v4/MilesInvertAckDialog (owner-locked OK-only: keep behaviour or leave with reason), pages/driver/ArrivalPrompt, pages/driver/StatusSuggestionPrompt, pages/inventory/PartCreateDrawer, pages/inventory/PartEditDrawer, pages/maintenance/FaultDraftsPage, pages/maintenance/WorkOrderDetailPage, pages/maintenance/components/ConvertIssueToWOModal, pages/safety/PermitsPage, pages/samsara-vendor-mapping/VendorMappingResolutionPage, pages/work-orders/WorkOrdersConsoleDetailPage. Each removed from `scripts/verify-popups-one-format.baseline.json` in the same PR |
| 443.365-D | catalog lists: no hand-typed `<table>/<th>` under pages/lists | count first, convert to ParityTable, count 0, add to the popup guard |
| 40 | Reports › Home — board verdict LAYERED | rebuilt to docs/design/v3 Reports board (rebuild, not layer) |
| 19 | One canonical source per entity across all views | each entity type renders through one shared label/link source; guard |
| 80 | Load 13699 Bradley IL delivery stop city-only | street + ZIP from the rate con/BOL through the stop editor engine; geocoded |
| 257 | ENG-22 G2 — 195 of 198 loads on a trailer type id that does not resolve in catalogs.equipment_types | resolve each to the real type (reefer vs dry van) from documents; FK so it cannot recur |
| 258 | ENG-23 G3 — loads booked under the old oldest-customer fallback | audit each against its documents; correct the customer through the engine; fallback removed |
| 259 | ENG-24 G4/G5/G13 — Creator owed bills posted + voided on Edit; 1 Creator line without a load; Creator expenses carry load links | Edit amends instead of post+void; every Creator line carries its load; guard |
| 261 | ENG-26 G8 — 991 of 8,057 postings without a load (factoring 155, settlement 105, fuel 27, expense 24, invoice 4) | rule per source: carry the load at the writer; back-fill from documents; the rest listed with why |
| 262 | ENG-27 G6 — 458 bank-categorization postings before 10-17 without a load | back-fill or explain each class; never auto-match bank lines |
| 263 | ENG-28 — posting-line-writer.ts inserts postings beside the engine | fold into the single posting door; guard: no posting insert outside the engine |
| 264 | ENG-29 — 12 of 198 loads have miles_driven_actual | fill from fence events (engine), going forward stamped at delivery |

Then: "CC3 DONE" + PR list.
