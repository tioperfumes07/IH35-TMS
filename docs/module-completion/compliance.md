# Module completion — Compliance — acceptance checklist

**PROGRESS: 2 of 9** · complete: `false` · as_of: 2026-07-29 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 2 |
| HOLD | 0 |
| OPEN | 7 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `COMP-S01` | **PASS** | Surface /compliance renders real entity-scoped data with no dead end | VERIFIED LIVE on prod 2026-07-29 in BOTH entities. Compliance Dashboard with 6 tabs, filing counters (100 overdue / 1 due soon / 2 upcoming) and a filterable 103-row register citing real regulation references (49 CFR §382.701, Tax Code §22.23). TRANSP and USMCA return DIFFERENT driver rosters under the same programs, and the Entity column reads TRANSP or USMCA accordingly — entity scoping proven by the differing rows, not by the count. | — |
| `COMP-S02` | **PASS** | Surface /compliance/property-tax renders real entity-scoped data with no dead end | Route /compliance/property-tax registered as ProtectedRoute wrapping PropertyTaxRenditionPage; page renders RenditionListView when no :id, with need-company guard; list view fetches /api/v1/property-tax/renditions and /api/v1/property-tax/appraisal-districts with operating_company_id; query errors now surface ListErrorBanner with retry; create-rendition and add-appraisal-district mutations scoped to selected company; ParityTable renders entity-scoped renditions with honest empty text. | #5322 |
| `COMP-S03` | **OPEN** | Surface /compliance/property-tax/:id renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |
| `COMP-T01` | **OPEN** | Tab "Overview" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `COMP-T02` | **OPEN** | Tab "HOS Tracker" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `COMP-T03` | **OPEN** | Tab "HOS Viewer" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `COMP-T04` | **OPEN** | Tab "Violations" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `COMP-T05` | **OPEN** | Tab "HOS History" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `COMP-T06` | **OPEN** | Tab "Required Documents" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |

Desktop audit: —
