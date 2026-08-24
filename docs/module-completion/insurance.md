# Module completion — Insurance — acceptance checklist

**PROGRESS: 6 of 6** · complete: `true` · as_of: 2026-08-24T13:20:00Z · live_sha: `5164640be`

| Status | Count |
|---|---:|
| PASS | 6 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `INS-S01` | **PASS** | Surface /insurance renders real entity-scoped data with no dead end | 2026-08-16 USMCA LIVE PASS: exact /insurance alias redirected to canonical /safety/insurance and rendered the real Insurance Dashboard with Landing, Policies, Type Catalog, Coverage Gaps, Claims, and Lawsuits routes. Scoped live KPIs were 3 active policies, 3 expiring, 41 coverage gaps, 4 open claims, and 1 open lawsuit; each KPI mounted its canonical drill route without 404/500. No mutation. Focused insurance module/dashboard-route guards exit 0. | — |
| `INS-T01` | **PASS** | Tab "Policies" opens and renders real entity-scoped data | 2026-08-16 USMCA LIVE PASS after frontend deploy #7821 (asset index-CTHSRnxD.js): fresh cache-busted /safety/insurance/policies rendered exactly 3 scoped policies and every Type cell displayed the canonical human label Auto Liability; zero raw auto_liability labels. Create policy, Filters, Search, Range, gear, pagination, and canonical policy detail links rendered. No save or mutation. Code fixes #7801/#7802; human-label guard normal + 8/8 mutations. | #7801 + #7802; deployed by #7821 |
| `INS-T02` | **PASS** | Tab "Type Catalog" opens and renders real entity-scoped data | 2026-08-16 USMCA LIVE PASS: /safety/insurance/type-catalog rendered exactly 15 canonical entries with distinct code, human name, description, sort order, active status, and Edit/Deactivate controls. The inline + Create type surface rendered and remained disabled until required input; no save or mutation. | — |
| `INS-T03` | **PASS** | Tab "Coverage Gaps" opens and renders real entity-scoped data | 2026-08-16 USMCA LIVE PASS after frontend deploy #7821 (asset index-CTHSRnxD.js): fresh cache-busted /safety/insurance/coverage-gaps rendered 39 uncovered units and 2 mismatched units with canonical unit drill links. Previously failing T163 displayed Auto Liability, Physical Damage, Cargo; T120 and T151 displayed Physical Damage, Cargo; zero raw underscore codes. Search, Range, gear, pagination, KPIs, and Unit picker rendered. No save or mutation. Code fixes #7801/#7802; guard normal + 8/8 mutations. | #7801 + #7802; deployed by #7821 |
| `INS-T04` | **PASS** | Tab "Claims" opens and renders real entity-scoped data | 2026-08-16 USMCA LIVE PASS: /safety/insurance/claims rendered exactly 4 scoped claim rows with human policy labels and canonical forward links for applicable policy, unit, trailer, driver, and load relationships. Search, Range, gear, four entity filters, and + Create claim rendered. No save or mutation. | — |
| `INS-T05` | **PASS** | Tab "Lawsuits" opens and renders real entity-scoped data | 2026-08-16 USMCA LIVE PASS: /safety/insurance/lawsuits rendered exactly 1 scoped lawsuit with human case, claim and court identity plus canonical lawsuit and claim drills; Search, Range, gear, + Create lawsuit, monetary columns, and honest Unassigned driver/unit states rendered. No save or mutation. | — |

Desktop audit: —
