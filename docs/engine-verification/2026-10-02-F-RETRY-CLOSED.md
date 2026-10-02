# F-RETRY — 18 CONFIRMED scheduled writers — closed

**Baseline:** independent 642 census · `artifacts/engine-audit-632/f-retry-scheduler-verdicts.csv`

| stage | CONFIRMED open | FIXED (code) | CLEARED (scheduler/idempotent) |
|---|---:|---:|---:|
| First pass (word-match 47) | 18 | 0 | 29 |
| After #24201 (geofence) | **17** | 1 | 29 |
| After this follow-up | **0** | 6 | 41 |

## FIXED (business-key idempotency)

| # | file | fix |
|---|---|---|
| 1 | `cron/geofence-breach-detector.cron.ts` | WHERE NOT EXISTS (#24201) |
| 2 | `banking/drift-alerts.service.ts` | ON CONFLICT `uq_drift_open_per_account_kind` |
| 3 | `cron/depreciation-autopost.cron.ts` | advisory claim + WHERE NOT EXISTS (company,run_date,asset) |
| 4 | `compliance/compliance-reminder.job.ts` | WHERE NOT EXISTS Chicago-day business key before notify |
| 5 | `reconciliation/ledger-integrity-detectors.service.ts` | INSERT…SELECT WHERE NOT EXISTS open scope |
| 6 | `cron/samsara-hos-pull.cron.ts` | advisory + 45min claim (relay pattern) |

Guard: `scripts/verify-f-retry-scheduled-writers-idempotent.mjs` (wired money-pr-local-gate).

## CLEARED from the 18 (not code defects)

Recurring generator (FOR UPDATE+CAS) · cash-advance expire UPDATE · relay (already claimed) ·
late-fee / payment-reminder status-gated UPDATEs · cash-flow cron reads · real-driven-miles
deterministic UPDATE · geofence-sync stamp-only-when-null · draft-crew UPDATE · model-lifecycle
zero writes · task-alarm SKIP LOCKED · audit-chain-verify zero writes · maybe-post-from-fuel retired.

Full reasons: `artifacts/engine-audit-632/f-retry-scheduler-verdicts.csv`.

**Remaining F-RETRY CONFIRMED: 0.**
