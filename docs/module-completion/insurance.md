# Module completion — Insurance — acceptance checklist

**PROGRESS: 6 of 6** · complete: `false` · as_of: 2026-08-09T02:00:00.000Z · live_sha: `5164640be`

| Status | Count |
|---|---:|
| PASS | 6 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `INS-S01` | **PASS** | Surface /insurance renders real entity-scoped data with no dead end | VERIFIED LIVE on prod 2026-07-29 in BOTH entities. /insurance resolves to /safety/insurance and renders the Insurance Dashboard with 6 tabs (Landing, Policies, Type Catalog, Coverage Gaps, Claims, Lawsuits). TRANSP: 84 active drivers, coverage gap count 50 with a 'View gap list' drill-through. USMCA: 77 active drivers, all insurance counters 0. Entity scoping proven by the differing driver counts and gap counts. | — |
| `INS-T01` | **PASS** | Tab "Policies" opens and renders real entity-scoped data | PASS 2026-08-09 — PoliciesList opco listInsurancePolicies + useListState + DataTable emptyText; PolicyCreate wizard; verify-list-empty-settled. | — |
| `INS-T02` | **PASS** | Tab "Type Catalog" opens and renders real entity-scoped data | PASS 2026-08-09 — TypeCatalogAdmin ParityTable loading/emptyText; verify-list-empty-settled. | — |
| `INS-T03` | **PASS** | Tab "Coverage Gaps" opens and renders real entity-scoped data | PASS 2026-08-09 — CoverageGapDashboard ParityTable settled empties; verify-list-empty-settled. | — |
| `INS-T04` | **PASS** | Tab "Claims" opens and renders real entity-scoped data | PASS 2026-08-09 — ClaimsTab useListState + emptyText (already guarded). | — |
| `INS-T05` | **PASS** | Tab "Lawsuits" opens and renders real entity-scoped data | PASS 2026-08-09 — LawsuitsTab useListState + emptyText (already guarded). | — |

Desktop audit: —
