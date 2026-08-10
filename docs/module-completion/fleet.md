# Module completion — Fleet — acceptance checklist

**PROGRESS: 4 of 7** · complete: `false` · as_of: 2026-07-29 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 4 |
| HOLD | 0 |
| OPEN | 3 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `FLEET-S01` | **PASS** | Surface /fleet renders real entity-scoped data with no dead end | Route /fleet registered; FleetHomePage uses CompanyContext and renders FleetTablePage with operatingCompanyId; GET /api/v1/mdata/units?include=trailers resolves entity scope via resolveOperatingCompanyId + owner/leased predicate; FleetTable renders unit_number, VIN, type, status, location with no uuid-fallback labels; + Create Unit / + Create Trailer actions wired; honest empty state when no company selected; tests pass. | #5289 |
| `FLEET-S02` | **PASS** | Surface /fleet/:id renders real entity-scoped data with no dead end | Route /fleet/:id registered as a ProtectedRoute wrapping FleetUnitLegacyRedirect; it redirects legacy unit bookmarks to canonical /fleet/units/:id and avoids collision with fleet leaf segments (/fleet/map, /fleet/transfers-in-progress, /fleet/units, /fleet/trailers); no dead end. | #5290 |
| `FLEET-S03` | **PASS** | Surface /fleet/map renders real entity-scoped data with no dead end | Route /fleet/map registered as ProtectedRoute wrapping PreserveSearchNavigate; it redirects to canonical /dispatch/map while preserving query/search params, so fleet map bookmarks resolve without a dead end. | #5291 |
| `FLEET-S04` | **PASS** | Surface /fleet/trailers/:id renders real entity-scoped data with no dead end | Route /fleet/trailers/:id registered as ProtectedRoute wrapping TrailerProfilePage; fetches /api/v1/mdata/equipment/:id with operating_company_id; buildEquipmentAggregate scopes by owner/lessee and returns 404 for cross-entity; page renders identity, specs, assignment, reefer, maintenance, compliance, reverse insurance/safety/legal/bank linkages, documents, audit history; archive action wired to soft-delete endpoint; honest empty states for missing company/profile; TrailerProfilePage.test.tsx passes. | #5295 |
| `FLEET-S05` | **OPEN** | Surface /fleet/transfers-in-progress renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |
| `FLEET-S06` | **OPEN** | Surface /fleet/units/:id renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |
| `FLEET-S07` | **OPEN** | Surface /fleet/units/:id/detail renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |

Desktop audit: —
