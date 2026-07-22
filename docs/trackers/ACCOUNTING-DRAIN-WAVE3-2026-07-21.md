# ACCOUNTING DRAIN — WAVE 3 verify (2026-07-21)

**Base:** `origin/main` @ `e2db37a74`  
**Worktree:** `/private/tmp/ih35-acct-drain-w3-verify-*`  
**Scope:** next 12 residual ACCOUNTING pending items **not** claimed by open PRs  
`#3132 #3138 #3140 #3143 #3144 #3145 #3146 #3147 #3129 #3127 #3128 #3133 #3116 #3120 #3149`  
(+ hard bans `#3123 #3124 #3141` and PUBLIC-grant sweep).

Owner rulings locked for this drain: reserve/holdback accounts owner-manual forever;  
`accounting.chart_of_accounts_roles` is PRIMARY; no inventing GL accounts; financial = HOLD;  
Rule 17 for new guards.

| # | block_id | verdict | evidence (repo @ e2db37a74) | follow-up PR |
|---|---|---|---|---|
| 1 | `dispatch-sweep-gap-21` | **STALE + residual REAL FIX** | `loads.routes.ts` already LEFT JOINs `accounting.invoices` on `source_load_id` + selects `invoice_status` (comment `gap-21`); guarded by `verify-dispatch-load-invoice-linkage` / step 114. **Residual:** Dispatcher Home `loadActiveLoads` lacked the same join. | fix PR (this wave) |
| 2 | `biz-flow-6-no-automatic-invoice-sending` | **COVERED** | Same product gap as `flow6-auto-invoice-sending` dispositioned OPEN/product-HOLD in WAVE 2 `#3138`. Manual `/send` only; no auto email-on-create. | none (dup) |
| 3 | `0033-audit-schema-manifest-tool` | **DESIGN HOLD** | `scripts/audit-schema.mjs` + `docs/schema/SCHEMA-MANIFEST.json` absent. Substitutes: migration-file schema guards (`verify-schema-parity*`, backbone, grants). Live Neon-pull manifest = owner/GUARD tool — do not fake from migrations. | design note in this doc |
| 4 | `0243-g4-deploy-smoke-fixed-unit-test-owner` | **HOLD (ops)** | `ci-boot-aggregate-smoke.mjs` reads `IH35_SMOKE_UNIT_ID` / `IH35_SMOKE_OPERATING_COMPANY_ID`; `render.yaml` preDeploy does **not** set them → recency resolve remains. Env/config owner decision; not a code invent. | owner Render env |
| 5 | `0251-gap11-commodity-gl` | **HOLD** | Blocked on `0251-gap10` commodity/product catalog (no commodity table/FK). No invent GL map. CoA roles PRIMARY. | after gap10 owner design |
| 6 | `0441-mod4-dispatch-settings-localstorage-only` | **SKIP / misfile** | Module misfiled under accounting. Real surface is `DispatchSettingsPage.tsx` localStorage-only. Backend persist = dispatch product design, not accounting GL. | refile → dispatch |
| 7 | `0441-mod8-tx-fields-captured-not-sent` | **DESIGN HOLD** | UI captures check/class/location in banking categorize drafts; `banking.bank_transactions` still lacks those columns (migrations through categorize unit/trip/driver only). Adding columns = financial-cluster migration → HOLD. | banking design HOLD (not this PR) |
| 8 | `audit2-internal-controls-approval-workflow` | **DESIGN HOLD** | `registerSettlementApprovalRoutes` exists; **not** imported in `index.ts`. Mounting without G1-3 membership hardening is unsafe (raw `operating_company_id` query trust on most handlers). Settlement approve/finalize = money-adjacent → HOLD. | companion design PR |
| 9 | `audit5-fraud-anomaly-detection` | **DESIGN HOLD (partial elsewhere)** | Fuel fraud detector + safety/integrity anomaly workers exist. **Absent:** ledger-wide accounting fraud (duplicate vendor payments, round-dollar clustering, off-hours JE). Adversarial “REFUTED” note was about file existence, not GL-wide coverage. | owner design for GL fraud |
| 10 | `audit7-cost-center-tracking` | **DESIGN HOLD** | No cost-center dimension distinct from locked unit/driver Class. Variance tooling absent. New dimension = schema + posting touch → HOLD. | owner/CPA |
| 11 | `audit8-revenue-leakage-detection` | **DESIGN HOLD** | Unbilled-revenue tracking / leakage views confirmed absent under accounting + reports. | owner/CPA |
| 12 | `h-05-home-kpi-no-date-range-toggle` | **DESIGN HOLD** | No 7d/30d/MTD/YTD selector on Home KPI bars. Hardcoded window labels only. Needs product + API period params (not a one-line UI patch). | home product design |
| — | `fact-par-1-submission-workflow` | **DESIGN HOLD** | Factoring submission queue hardcodes `channel: "manual_download"` only; no email/file-drop adapters. | factoring design |
| — | `driverprofile-1-companion-tier1-rls-hardening` | **SKIP / misfile** | Accounting pile misfile. Claim is drivers RLS companion to PR #1742 (FE-only). Not an accounting CoA/GL gap. | refile → drivers; Neon RLS proof separate |

## NEEDS-OWNER (confirmed HOLD — not reopened this wave)

All remaining accounting `NEEDS-OWNER` rows (`0091-d1-2`, `0251-gap2/3`, `0473-*`, `AF-1/4`, `CHAIN-04/06`, `dip-mor-*`, `factoring-asc860`, `flow2-*`, `ifta-sales-tax-*`, `usmca-unhide-*`, `0519-at2`, `0242-no-auto-customer-charge`) stay owner/CPA gated. No builder invent.

## NEEDS-PROD (not Neon-applied this wave)

`0007-pattern-5-split-brain-engines`, `0243-flag-live-all-9-gl-flags-on_DONE`, `usmca-banking-ingestion-dedup` — already in `#3117` Neon verdicts track. Builder does **not** Neon-read.

## Discipline

- Docs-only in this PR. Builder **does not merge**.
- No schema / CoA seed / PUBLIC grants / package.json / CI workflow edits.
- UNVERIFIED: live Render smoke env values; Neon grant/flag state; prod row counts for factoring channels.
