# Module completion — Insurance — acceptance checklist

**PROGRESS: 1 of 6** · complete: `false` · as_of: 2026-07-29 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 1 |
| HOLD | 0 |
| OPEN | 5 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `INS-S01` | **PASS** | Surface /insurance renders real entity-scoped data with no dead end | VERIFIED LIVE on prod 2026-07-29 in BOTH entities. /insurance resolves to /safety/insurance and renders the Insurance Dashboard with 6 tabs (Landing, Policies, Type Catalog, Coverage Gaps, Claims, Lawsuits). TRANSP: 84 active drivers, coverage gap count 50 with a 'View gap list' drill-through. USMCA: 77 active drivers, all insurance counters 0. Entity scoping proven by the differing driver counts and gap counts. | — |
| `INS-T01` | **OPEN** | Tab "Policies" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `INS-T02` | **OPEN** | Tab "Type Catalog" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `INS-T03` | **OPEN** | Tab "Coverage Gaps" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `INS-T04` | **OPEN** | Tab "Claims" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `INS-T05` | **OPEN** | Tab "Lawsuits" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |

Desktop audit: —
