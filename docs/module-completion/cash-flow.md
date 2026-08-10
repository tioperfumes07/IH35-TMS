# Module completion — Cash Flow — acceptance checklist

**PROGRESS: 3 of 3** · complete: `true` · as_of: 2026-07-29 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 3 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `CASH-S01` | **PASS** | Surface /cash-flow renders real entity-scoped data with no dead end | VERIFIED LIVE on prod 2026-07-29 in BOTH entities. 3 tabs (Projected Auto / Actual vs Projected / Manual Daily Projections), a 7-day outlook, and an inline '+ ADD NEW BILL OR EXPENSE' creator. TRANSP opening cash −$168,722.50 with a −$95k day in the outlook; USMCA opening cash $92.68 with a flat outlook. Entity scoping proven by the differing opening balances. | — |
| `CASH-T01` | **PASS** | Tab "Actual vs Projected" opens and renders real entity-scoped data | CashFlowPage mounts ActualVsProjectedTab and ManualDailyProjectionsTab with operatingCompanyId; both tabs entity-scope queries via operatingCompanyId in queryKey and API calls; ManualDailyProjectionsTab now surfaces ListErrorBanner + loading state; guard verify-cash-flow-tabs-entity-scoped.mjs selftests. | #5340 |
| `CASH-T02` | **PASS** | Tab "Manual Daily Projections" opens and renders real entity-scoped data | CashFlowPage mounts ActualVsProjectedTab and ManualDailyProjectionsTab with operatingCompanyId; both tabs entity-scope queries via operatingCompanyId in queryKey and API calls; ManualDailyProjectionsTab now surfaces ListErrorBanner + loading state; guard verify-cash-flow-tabs-entity-scoped.mjs selftests. | #5340 |

Desktop audit: —
