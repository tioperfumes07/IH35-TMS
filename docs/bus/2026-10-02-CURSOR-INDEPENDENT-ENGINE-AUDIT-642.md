# CURSOR — INDEPENDENT ENGINE AUDIT (ALL 642) — 2026-10-02

Method: identical population + nine checks from `10-02-2026-IH35-ENGINE-AUDIT-632-ENGINES.xlsx`
sheet **5 METHOD AND LIMITS** / **7 DEEP AUDIT METHOD**. Derived BEFORE reading CC-1/owner
counts. Reachability resolver **strips `.js`** on relative imports.

Population: every file under `apps/backend/src` matching `.service` / `.cron` / `.worker` /
`.job` / `.engine`, excluding `.test` / `__tests__`.

Tip SHA at measure: see `artifacts/engine-audit-632/summary.json` → `tip_sha`.
Full per-engine rows: `artifacts/engine-audit-632/engines-632.csv` (642) +
`artifacts/engine-audit-632/verdicts-all.txt` (642 lines, nine answers each).

## Independent counts vs owner approx

| metric | Cursor (this run) | Owner approx | Diff |
|---|---:|---:|---:|
| population | **642** | 632 | **+10** |
| .service / .cron / .job / .worker / .engine | 564 / 66 / 5 / 4 / 3 | 555 / 65 / 5 / 4 / 3 | +9 svc, +1 cron |
| writers | **348** | 333 | **+15** |
| read-only | **294** | 299 | −5 |
| money writers (INSERT journal_entries/postings) | **11** | 11–13 | in range |
| wired | **623** | 620 | +3 |
| orphan | **11** | 12 | −1 |
| test-only | **8** | 8 | 0 |
| test-covered | **355** | 326 | +29 |
| writers with no header | **165** | 165 | **0** |
| F-RETRY candidates (substring schedule) | **47** | 37 | +10 |

Diffs are tip growth since the 2026-10-02 workbook tree + substring `schedule` match
(includes `fee_schedule` / `schedulers` FPs that the CLEARED pass removes).

Nine-check flag tallies (static; high FP on D/E per method sheet): see `summary.json` → `flags`.

## P0 — cross-company writes

### 1) `safety/reminders.cron.ts` — CONFIRMED → FIXED

- Live scheduler: `initializeSafetyRemindersCron` in `index.ts`; `cron.schedule("15 6 * * *")`.
- Ran under `withLuciaBypass` (RLS OFF). Resolve-stale `UPDATE safety.compliance_reminders`
  had only `status='open' AND last_detected_at < $1` — **no `operating_company_id`**.
- Neon scoped read (`br-fancy-credit-akjnd07a`, bypass_rls=lucia): today only USMCA has
  reminder/source rows (USMCA open=0 total=1; TRANSP/TRK source tables empty). The **code path**
  still walked every company and would resolve frozen-company open rows the moment any exist.
- **FIX:** USMCA-only (`5c854333-…`) on candidate SELECTs + resolve UPDATE.
  Guard: `scripts/verify-safety-reminders-cron-usmca-scoped.mjs` (+ `--selftest`) exit 0.

### 2) `middleware/idempotency-cleanup.cron.ts` — CLEARED (by design)

- Live scheduler: `initializeIdempotencyCleanupCron`; daily 03:30 CT.
- `DELETE FROM public.idempotency_keys WHERE ttl_at <= now()` under bypass.
- Table is HTTP idempotency cache (24h TTL), not a financial register. Migration
  `202606071300_idempotency_keys.sql` documents cleanup by `ttl_at` across tenants; RLS is
  defense-in-depth while middleware writes via lucia bypass. Expired keys have no
  company-scoped business meaning. **Leave global.** Reason recorded here.

## F-RETRY — 47 candidates → scheduler verdicts

File: `artifacts/engine-audit-632/f-retry-scheduler-verdicts.csv`

| scheduler_verdict | n |
|---|---:|
| CONFIRMED (really on a live scheduler) | **18** |
| CLEARED (word-match only) | **29** |

### CLEARED examples (biggest named blast-radius — word-match FPs)

| file | why CLEARED |
|---|---|
| `qbo/push.service.ts` | mentions “schedulers” in a comment; not registered in cron |
| `factoring/factor.service.ts` | `fee_schedule` field; not a cron writer |
| `driver-finance/cash-advance-owner-approval.service.ts` | no live scheduler import |
| `accounting/lease-asc842/lease.service.ts` | no live scheduler |
| `leases/lease-engine.service.ts` | no live scheduler |
| `accounting/recon/recon-engine.service.ts` | no live scheduler |
| `integrations/samsara/routes-integration.service.ts` | has ON CONFLICT / idempotency → not even F-RETRY |

### CONFIRMED (18) — live double-tick possible

Including: `cron/geofence-breach-detector.cron.ts` (**FIXED this PR**:
`INSERT … SELECT … WHERE NOT EXISTS` on business key),
`accounting/bills/recurring/generator.service.ts`,
`driver-finance/cash-advance-requests.service.ts` (via expiry cron — expire UPDATE is
naturally idempotent on status),
`integrations/relay-payments/relay-fuel-ingest.cron.ts`,
`cron/depreciation-autopost.cron.ts`, `insurance/late-fee.service.ts`,
`insurance/payment-reminder.service.ts`, `compliance/compliance-reminder.job.ts`,
`banking/drift-alerts.service.ts`, `cash-flow/cash-flow.service.ts`,
`telematics/load-real-driven-miles.service.ts`, `telematics/load-stop-geofence-sync.service.ts`,
`reconciliation/ledger-integrity-detectors.service.ts`,
`cron/draft-crew-status-selfheal.cron.ts`, `cron/model-lifecycle-monitor.cron.ts`,
`cron/samsara-hos-pull.cron.ts`, `tasks/task-alarm.job.ts`,
`audit/audit-chain-verify.cron.service.ts`,
`accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts`.

Remaining CONFIRMED without a code fix in this PR stay **DEFECT (F-RETRY)** on the verdict
line until each gets ON CONFLICT / WHERE NOT EXISTS on the **business** key.

## Still-open money paths (measured on tip)

- **Fuel same-txn + one writer:** already on tip.
  `verify-one-bank-match-writer-writes-je` PASS;
  `verify-fuel-posts-only-on-bank-match` PASS.
  Survivors: match=`acceptMatchWithResolveDifference`, unmatch=`unmatchBankTransaction`.
  Auto-match forbidden. Live $20,942.94 / 44 Relay remains **data** behind the engine (owner
  feeds; seats do not match in prod).
- **bank_transaction reversibility (fork `br-bitter-sunset-ak409eug` ONLY):**
  - Live matched census on fork: **98 matched / 0 with JE** — historical half-write stamps.
  - Unmatch of JE-less match clears `review_state→for_review` with **no reversing JE**
    (`cleared_without_reversing_je=true` on `52c51c10-…`). That is the live defect class:
    match stamped without an entry, so unmatch cannot reverse what was never posted.
  - Code path proof (fork-only synthetic): match JE `aaaaaaaa-…0001` + stamp on
    `7d6b3dac-…`, then unmatch + reversing JE `aaaaaaaa-…0002` in **one** transaction
    **txid `14894119`** — line `for_review` / unmatched, original.reversed_by =
    reversing, reversing.reverses = original. **PASS for the writer when a JE exists.**
  - `unmatchBankTransaction` runs inside one `withLuciaBypass` BEGIN/COMMIT; flag clear +
    `reverseJournalEntryNoFlip` share the client.

## Deliverable files

- `artifacts/engine-audit-632/engines-632.csv` — 642 rows, register columns + nine checks + verdict
- `artifacts/engine-audit-632/verdicts-all.txt` — one line per engine
- `artifacts/engine-audit-632/f-retry-scheduler-verdicts.csv` — all F-RETRY CONFIRMED/CLEARED
- `artifacts/engine-audit-632/summary.json` — counts + diffs
- Guards exit 0: reminders USMCA scope; bank match one-writer; fuel posts-only-on-match

NO production post / seed / feed / match / categorize by this seat.
