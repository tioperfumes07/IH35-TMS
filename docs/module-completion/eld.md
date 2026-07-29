# Module completion — Eld — acceptance checklist

**PROGRESS: 1 of 5** · complete: `false` · as_of: 2026-07-29 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 1 |
| HOLD | 0 |
| OPEN | 4 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `ELD-S01` | **PASS** | Surface /eld renders real entity-scoped data with no dead end | VERIFIED LIVE on prod 2026-07-29 in BOTH entities. 5 tabs (Live Duty Status, HOS Violations, Unidentified Driving, Driver Certifications, ELD Settings). TRANSP: 6 drivers on the canonical roster from GET /api/v1/telematics/hos/daily-roster with real duty status, drive-left and shift-left values (e.g. T176 Sleeper Berth 10h54m / 3h51m). USMCA: 0 rows with an explicit honest-empty message, 'No HOS duty events for this company today (honest empty — ingest may be quiet)' — an honest empty, not a silent blank. | — |
| `ELD-T01` | **OPEN** | Tab "HOS Violations" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `ELD-T02` | **OPEN** | Tab "Unidentified Driving" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `ELD-T03` | **OPEN** | Tab "Driver Certifications" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `ELD-T04` | **OPEN** | Tab "ELD Settings" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |

Desktop audit: —
