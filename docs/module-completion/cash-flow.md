# Module completion — Cash Flow — acceptance checklist

**PROGRESS: 1 of 3** · complete: `false` · as_of: 2026-07-29 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 1 |
| HOLD | 0 |
| OPEN | 2 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `CASH-S01` | **PASS** | Surface /cash-flow renders real entity-scoped data with no dead end | VERIFIED LIVE on prod 2026-07-29 in BOTH entities. 3 tabs (Projected Auto / Actual vs Projected / Manual Daily Projections), a 7-day outlook, and an inline '+ ADD NEW BILL OR EXPENSE' creator. TRANSP opening cash −$168,722.50 with a −$95k day in the outlook; USMCA opening cash $92.68 with a flat outlook. Entity scoping proven by the differing opening balances. | — |
| `CASH-T01` | **OPEN** | Tab "Actual vs Projected" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |
| `CASH-T02` | **OPEN** | Tab "Manual Daily Projections" opens and renders real entity-scoped data | NOT YET VERIFIED. This tab EXISTS — it was observed on the rendered tab strip on prod 2026-07-29 — but only the module's landing tab was opened and checked. To reach PASS this tab must be opened in BOTH TRANSP and USMCA and shown to render real entity-scoped data, with an honest empty state where there is none. | — |

Desktop audit: —
