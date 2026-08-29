# Module completion — Inventory (Parts & Stock)

**PROGRESS: 3 of 7** · complete: `false` · as_of: 2026-08-29T16:40:00Z · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 3 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 4 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `INV-S01` | **PASS** | /inventory Parts & Stock roster count matches maintenance.parts_inventory | 2026-08-16 USMCA LIVE PASS: /inventory rendered 2 scoped Parts & Stock rows; authenticated GET /api/v1/maintenance/parts with the same operating_company_id returned exactly 2 rows with matching IDs, names, quantities, and costs. Guard verify-inv-s01-parts-roster-density step 2256 remains green. | — |
| `INV-CAT-01` | **UNVERIFIED** | Category column populated or honestly N/A (not 100% blank) | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: 2026-08-16 USMCA LIVE PASS: both scoped /inventory rows rendered the human category Brake; Create Part mounted the required canonical category picker. Guard verify-inv-cat-01-category-honesty.mjs step 2260 remains green; no category was invented or mutated. | #4223 |
| `INV-S02` | **PASS** | /inventory/assignments entity-scoped and honest empty when unassigned | 2026-08-16 USMCA LIVE PASS: /inventory/assignments rendered its exact Assignment trail with honest 0-row copy; authenticated GET /api/v1/maintenance/parts-invoice-links for the same operating company returned exactly 0 rows. Guard step 2264 remains green. | — |
| `INV-S03` | **PASS** | /inventory/purchases Purchase History tab wired | 2026-08-16 USMCA LIVE PASS: /inventory/purchases rendered append-only Purchase History with honest 0-row copy; authenticated GET /api/v1/maintenance/parts-inventory/purchases for the same operating company returned exactly 0 rows. The old HOLD is superseded by the shipped append-only purchase ledger. Guard step 2264 remains green. | — |
| `INV-PICK-01` | **UNVERIFIED** | Parts picker canonical read is maintenance.parts_inventory not catalogs.parts | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: 2026-08-16 USMCA LIVE PASS: /inventory and its Create/Edit drawers loaded the same 2 canonical maintenance.parts_inventory rows returned by the scoped maintenance parts endpoint; no catalogs.parts surface appeared. Guard verify-inv-s02-s03-pick-01 remains green. | — |
| `INV-LINK-01` | **UNVERIFIED** | Part → vendor linkage on create/edit (0441-mod13-inventory-part-to-vendor) | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: 2026-08-16 USMCA LIVE PASS: Parts & Stock rendered P42-VENDOR-FK-20260811 on the canonical linked part; opening Edit after reload preserved that exact human vendor selection. Create Part vendor picker placed + Add new vendor first, followed by scoped human vendor labels. Guard verify-inv-link-01-part-vendor.mjs step 2354 remains green. | — |
| `INV-VERIFY-01` | **UNVERIFIED** | Inventory module VERIFY-1..8 — USMCA TMS-native | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: 2026-08-16 USMCA LIVE PASS: /inventory rendered exactly 2 scoped stock rows; Parts & Stock, Assignments, and Purchase History all mounted without 404/500. Assignments and Purchase History showed honest zero states. Search, Range, gear, Create Part, canonical Category and Preferred Vendor controls rendered; the vendor picker placed + Add new vendor first and the persisted P42-VENDOR-FK-20260811 row exposed its canonical vendor drill. No save or mutation. TRANSP is explicitly N/A under the owner-closed USMCA-only sprint law; no TRANSP or QBO claim is made. Meta guard step 2268 composes the six exact inventory acceptance guards and three canonical routes. | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/inventory-deep-2026-08-01.md
