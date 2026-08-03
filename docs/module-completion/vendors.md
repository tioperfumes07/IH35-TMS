# Module completion — Vendors

**PROGRESS: 5 of 7** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 5 |
| HOLD | 0 |
| OPEN | 2 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `VEND-S01` | **PASS** | /vendors roster active count matches Neon mdata.vendors | 2026-08-03 Neon lucia br-fancy-credit-akjnd07a: TRANSP active=564 inactive=387 · TRK=1873 · USMCA=4 (deactivated_at IS NULL). Vendors.tsx listVendors + default Active filter. Guard verify-vend-s01-roster-active-filter + step 2236. (Auditor 563 was prior snapshot; live lucia now 564.) | — |
| `VEND-S02` | **PASS** | Vendor detail factor schedule uses factoring.factor not notes parse | 2026-08-03 Cursor #4211: FactoringHome profile PATCH advance_rate/fee_rate/reserve_rate + remittance_details on factoring.factor; VendorDetail strips factoring notes block + relocates schedule UI to /factoring. Guard verify-fact-dual-canonical-profile step 2242. Neon Faro TRANSP flat rates 0.97/0.015/0.015. | 4211 |
| `VEND-LINK-01` | **OPEN** | Bills/allocations EntityLink uses vendor_uuid not legacy vendor_id text | scaffold — FAIL system-wide wrong-column linkage (accounting module) | — |
| `VEND-S03` | **PASS** | Vendor create dedup guard scoped per operating company | 2026-08-03 Cursor: vendors.routes resolves operating_company BEFORE dedup; match is lower(btrim(vendor_name))+opco+deactivated_at IS NULL (G6-2). Guard verify-vend-s03-s04-dedup-and-types + step 2238. | — |
| `VEND-S04` | **PASS** | Vendor types catalog-backed (catalogs.vendor_types populated) | 2026-08-03 Neon lucia: catalogs.vendor_types 8/TRANSP · 8/TRK · 8/USMCA. VendorCreateModal + NewVendorDrawerForm createKind=vendor_type → catalogs.vendor_types. Guard step 2238. | — |
| `VEND-S05` | **PASS** | Inactive vendor filter excludes 387 inactive from default Active view | 2026-08-03 Neon lucia TRANSP inactive=387 exact. Vendors.tsx default listStatus="active" filters deactivated_at==null; data-list-status-filter=vendors. Guard verify-vend-s01-roster-active-filter + step 2236. | — |
| `VEND-VERIFY-01` | **OPEN** | Vendors module VERIFY-1..8 TRANSP + USMCA | scaffold — roster PASS; detail/dual-path UNVERIFIED USMCA | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/factoring-deep-2026-08-01.md
