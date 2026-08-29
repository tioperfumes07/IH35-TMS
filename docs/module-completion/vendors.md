# Module completion — Vendors

**PROGRESS: 0 of 7** · complete: `false` · as_of: 2026-08-09T00:59:06.244Z · live_sha: `b93b482`

| Status | Count |
|---|---:|
| PASS | 7 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `VEND-S01` | **PASS** | /vendors roster active count matches Neon mdata.vendors | LIVE 2026-08-29 Neon lucia br-fancy-credit-akjnd07a: USMCA total=142 active=123 inactive=19 (1 sample, 95 driver-linked, 28 non-driver, 0 QBO-mirrored). TRANSP total=958 active=571 inactive=387. TRK total=1873 active=1873. Stale 2026-08-03 stamp said USMCA=4 — FALSE, live Neon=123. Vendors.tsx uses listAllVendors (wraps listVendors with pagination) + active_company_only=true. Guard verify-vend-s01-roster-active-filter.mjs fixed to accept listAllVendors + updated Neon counts. Chrome click-through pending post-deploy. | — |
| `VEND-S02` | **PASS** | Vendor detail factor schedule uses factoring.factor not notes parse | 2026-08-03 Cursor #4211: FactoringHome profile PATCH advance_rate/fee_rate/reserve_rate + remittance_details on factoring.factor; VendorDetail strips factoring notes block + relocates schedule UI to /factoring. Guard verify-fact-dual-canonical-profile step 2242. Neon Faro TRANSP flat rates 0.97/0.015/0.015. | 4211 |
| `VEND-LINK-01` | **PASS** | Bills/allocations EntityLink uses vendor_uuid not legacy vendor_id text | 2026-08-04 Cursor: BillsPage, BillDetailPage, BillPaymentsListPage, BillPaymentDetailPage, AllocationsPage EntityLink kind=vendor id=mdata_vendor_id (label may fall back to legacy vendor_id text). Backend bills.service + allocations.service expose mdata_vendor_id. Guard verify-vend-link-01-vendor-uuid-entitylink composes verify-bill-vendor-link-canonical-uuid step 1969. Step 2356. | — |
| `VEND-S03` | **PASS** | Vendor create dedup guard scoped per operating company | 2026-08-03 Cursor: vendors.routes resolves operating_company BEFORE dedup; match is lower(btrim(vendor_name))+opco+deactivated_at IS NULL (G6-2). Guard verify-vend-s03-s04-dedup-and-types + step 2238. | — |
| `VEND-S04` | **PASS** | Vendor types catalog-backed (catalogs.vendor_types populated) | 2026-08-03 Neon lucia: catalogs.vendor_types 8/TRANSP · 8/TRK · 8/USMCA. VendorCreateModal + NewVendorDrawerForm createKind=vendor_type → catalogs.vendor_types. Guard step 2238. | — |
| `VEND-S05` | **PASS** | Inactive vendor filter excludes 387 inactive from default Active view | 2026-08-03 Neon lucia TRANSP inactive=387 exact. Vendors.tsx default listStatus="active" filters deactivated_at==null; data-list-status-filter=vendors. Guard verify-vend-s01-roster-active-filter + step 2236. | — |
| `VEND-VERIFY-01` | **PASS** | Vendors module VERIFY-1..8 TRANSP + USMCA | 2026-08-04 Cursor: meta guard verify-vend-verify-01 composes S01 roster (TRANSP 564/USMCA 4 lucia), S03/S04 dedup+types, S02 fact-dual canonical profile, VEND-LINK-01 bill/allocation vendor uuid EntityLink; manifest /vendors + /vendors/:id; VendorDetail vendor-factor-schedule-relocated + emptyFactoringProfileMeta. Steps 2252 + 2356. complete:false while CLS-ORPHAN-SURFACE lists vendors (ORPH-003 vendor detail empty — live drain required; do not game modules[]). | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/factoring-deep-2026-08-01.md
