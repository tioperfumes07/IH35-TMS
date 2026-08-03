# Module completion — Vendors

**PROGRESS: 1 of 7** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 1 |
| HOLD | 0 |
| OPEN | 6 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `VEND-S01` | **PASS** | /vendors roster active count matches Neon mdata.vendors | 2026-08-03 Neon lucia br-fancy-credit-akjnd07a: TRANSP active=564 inactive=387 · TRK=1873 · USMCA=4 (deactivated_at IS NULL). Vendors.tsx listVendors + default Active filter. Guard verify-vend-s01-roster-active-filter + step 2236. (Auditor 563 was prior snapshot; live lucia now 564.) | — |
| `VEND-S02` | **OPEN** | Vendor detail factor schedule uses factoring.factor not notes parse | scaffold — FAIL: serializeVendorNotes/parseVendorNotes dual-path | — |
| `VEND-LINK-01` | **OPEN** | Bills/allocations EntityLink uses vendor_uuid not legacy vendor_id text | scaffold — FAIL system-wide wrong-column linkage (accounting module) | — |
| `VEND-S03` | **OPEN** | Vendor create dedup guard scoped per operating company | scaffold — not proven | — |
| `VEND-S04` | **OPEN** | Vendor types catalog-backed (catalogs.vendor_types populated) | scaffold — Neon 24 rows (8/opco) per corrected backlog doc | — |
| `VEND-S05` | **OPEN** | Inactive vendor filter excludes 387 inactive from default Active view | scaffold — auditor PASS: inactive excluded consistently | — |
| `VEND-VERIFY-01` | **OPEN** | Vendors module VERIFY-1..8 TRANSP + USMCA | scaffold — roster PASS; detail/dual-path UNVERIFIED USMCA | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/factoring-deep-2026-08-01.md
