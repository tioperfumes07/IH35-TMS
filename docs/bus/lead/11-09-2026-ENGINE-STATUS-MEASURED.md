# ENGINE STATUS — MEASURED — 2026-11-09 7:35 PM CT (2026-11-10 01:35Z)

Scope: USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Sources: prod `_system.background_jobs` (Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, bypass `lucia`), `docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md`, `docs/bus/lead/ENGINE-REGISTER.json` (72 rows: 38 DONE-LIVE, 14 DONE, 8 PARTIAL, 7 OPEN, 5 MERGED-UNVERIFIED).

## 1 · Engine-run table (prod, 01:21Z)

- 145 engines recorded. 4 had their last run failing; 40 had no success in 2 days.
- Of the 40 stale: 32 are the QBO pull/push family. They are **OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync** (§1a), so they are not stale and not failing. That leaves 8: 3 run monthly/weekly and are on schedule (depreciation 11-01, insurance report 11-05, settlement auto-pay Fri 11-06); CSA BASIC pull is opt-in OFF (`ENABLE_CSA_BASIC_PULL_CRON`); and the 4 below.

### 1a · QBO family — OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync

Owner, 11-09 8:25 PM CT: "we are not syncing with quickbooks." No QBO pull or push is re-enabled. `catalogs.blocked_feature_flags` stays as is: 17 QBO rows, all set 09-28 17:52:37Z (ROUND 195). No QBO engine was changed and nothing was written to prod. USMCA has 0 rows in `integrations.qbo_connections` and 0 rows in `mdata.qbo_purchases` (measured 11-10 02:20Z).

| # | Engine (`_system.background_jobs.job_name`) | Last success (UTC) | Status |
|---|---|---|---|
| 1 | `integrations.qbo_cdc_poll` | 08-21 13:20 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 2 | `integrations.qbo_inbound_sync` | 08-21 13:22 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 3 | `qbo.forensic_import_runner` | 09-26 00:28 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 4 | `qbo.master_data_sync.delta` | 09-28 12:15 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 5 | `qbo.master_data_sync.full` | 09-28 07:01 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 6 | `qbo.sync_alerts_cron` | 09-28 12:15 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 7 | `qbo.token_refresh_cron` | 09-26 00:01 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 8 | `qbo_sync.drift_scheduler` | 09-07 21:01 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 9 | `qbo_sync.step.ap_bill_payments_project` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 10 | `qbo_sync.step.ap_bill_payments_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 11 | `qbo_sync.step.ap_bills_project` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 12 | `qbo_sync.step.ap_bills_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 13 | `qbo_sync.step.ar_invoices_project` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 14 | `qbo_sync.step.ar_invoices_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 15 | `qbo_sync.step.ar_payments_project` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 16 | `qbo_sync.step.ar_payments_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 17 | `qbo_sync.step.chart_of_accounts_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 18 | `qbo_sync.step.chart_of_accounts_reconcile` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 19 | `qbo_sync.step.customers_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 20 | `qbo_sync.step.customers_reconcile` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 21 | `qbo_sync.step.drift_detect` | 09-07 21:01 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 22 | `qbo_sync.step.items_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 23 | `qbo_sync.step.items_reconcile` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 24 | `qbo_sync.step.qbo_purchases_project` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 25 | `qbo_sync.step.qbo_purchases_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 26 | `qbo_sync.step.qbo_vendor_credits_project` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 27 | `qbo_sync.step.qbo_vendor_credits_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 28 | `qbo_sync.step.vendors_pull` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 29 | `qbo_sync.step.vendors_reconcile` | 09-28 09:00 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 30 | `sync.qbo_accounts_push` | 09-26 00:27 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 31 | `sync.qbo_customers_push` | 09-26 00:27 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |
| 32 | `sync.qbo_vendors_push` | 09-26 00:27 | OFF BY OWNER RULING 11-09 8:25 PM CT: no QuickBooks sync |

Health and guards (read on main `fe88c563`): `/healthz` `checkBackgroundJobStaleness` (`apps/backend/src/health/health.routes.ts`) counts none of the 32 as never-succeeded or late:
- All 32 have a recorded success, so none is counted as never-succeeded.
- 9 (rows 1–4, 6, 7 and 30–32) return a dormant rule (`no_qbo_realm_connected` / `env_disabled`), because USMCA has 0 QBO connection rows and render.yaml sets `ENABLE_QBO_CDC_POLL` and `ENABLE_QBO_INBOUND_SYNC` to `"false"`, so they are skipped.
- `qbo.master_data_sync.full`, the 21 `qbo_sync.step.*` jobs and `qbo_sync.drift_scheduler` have no late rule, so they are skipped.

Live `GET https://api.ih35dispatch.com/api/v1/healthz` (11-10 02:28Z, sha `fe88c56`): `background_jobs.stale` = `never_succeeded_jobs`. From prod, 1 of 145 jobs has never succeeded (`last_successful_run_at IS NULL`), and it is `fuel.relay_fill_records` (F11107 lane), not QBO.
- One condition was not read: `qbo.master_data_sync.delta` would be counted late only if `QBO_MASTERDATA_SYNC_ENABLED=true` were set in the Render dashboard. It is not in render.yaml. Its health rule is at `health.routes.ts` `case "qbo.master_data_sync.delta"`.
- No `scripts/verify-*` guard reads prod job age. No code change was needed.

| Engine | Before (01:21Z) | Fix | After |
|---|---|---|---|
| `integrations.auto_status_switch_worker` | last success 11-03 16:05Z; failing every 5 min (23503 FK) | ACCT-F11121 #28678 `82b7d1f3` + migration 202616440100 (applied 01:19:40Z) | DONE-LIVE: success 01:30:07Z; 120 USMCA snapshots / 40 units 01:25–01:35Z; 0 snapshots for any other entity |
| `safety.da_random_pool.quarterly_draw` | last success 08-16; failed 10-01 12:00Z (42P08) | ACCT-F11120 #28677 `3a3f7e8b` | MERGED — the draw is quarterly; prod PREPARE of the fixed statements passes. OWNER: Q4 draw missed; 1 of 13 active drivers enrolled → Safety › Drug & Alcohol › enroll all active, then run the draw |
| `customers.relationship_score_worker` | last success 10-25 15:12Z; USMCA rescored 11-09 (862) / 11-10 (355) with no success record | ACCT-F11123 #28683 `f7642ab6` — the worker looped all 3 entities | MERGED — proof = a success after the deploy |
| `fuel.relay_fill_records` | never succeeded; 16 refusals named every 06:00 CT run | none — 13 of 16 are the ACCT-F11107 fuel pairs (Relay-rail record voided by #28661 as a second record of the purchase; the fill document is still live). 3 refused by name: txn_EE9rkFekb8YWD4 $686.35 no truck · txn_2gAW9V27xqzpYB $232.12 no driver · txn_8LZfDKWFvFv1oD $40.89 two DEF lines | OPEN — F11107 lane |

### 1b · Re-measure — 11-10 04:15Z (11-09 10:15 PM CT), prod `_system.background_jobs`

145 engines. Last run failed: 3. No success in 48h: 39 (32 QBO, OFF by owner ruling 11-09 8:25 PM CT, excluded). Outside QBO, 7 engines have a failed last run or no success in 48h:

| Engine | Last success (UTC) | Last fail (UTC) / error | Verdict | Action |
|---|---|---|---|---|
| `fuel.relay_fill_records` | never | 11-09 12:00 — `relay_fill_records_refused (16)`: 13 `fuel_tx_source_row_hash_uk` duplicate keys + 3 named | FAILING — fixed in this PR (ACCT-F11107) | idempotent skip of the 13; 3 named see below |
| `customers.relationship_score_worker` | 10-25 15:12 | 10-08 19:17 `read ECONNABORTED` (last fail precedes last success) | STALE, not failing — fixed by ACCT-F11123 #28683 (USMCA only) | proof = a success after deploy |
| `safety.da_random_pool.quarterly_draw` | 08-16 20:26 | 10-01 12:00 `inconsistent types deduced for parameter $1` | FAILING — fixed by ACCT-F11120 #28677; quarterly | OWNER: enroll active drivers, run the Q4 draw |
| `compliance.csa_basic_pull_cron` | 06-30 10:30 | 08-16 10:30 `public_csa_basic_source_unavailable` (2 of 2 companies) | opt-in OFF (`ENABLE_CSA_BASIC_PULL_CRON`); FMCSA public source unavailable, not a code defect | none |
| `accounting.depreciation_autopost` | 11-01 12:15 | 11-01 12:15:04 `permission denied for table depreciation_autopost_runs`, success 5 s later | monthly, on schedule (next 12-01) | none |
| `insurance.monthly_report_by_5th` | 11-05 13:00 | 09-05 12:00 (fail precedes success) | monthly, on schedule | none |
| `driver_finance.settlement_auto_pay_cron` | 11-06 12:00 | never | weekly (Fri), on schedule (next 11-13) | none |

`fuel.relay_fill_records` root cause (measured): the 13 fills are the ACCT-F11107 pairs. Each has a live Relay fill document (`accounting.expenses`, `source_fuel_transaction_id IS NULL`) and a VOIDED Relay-rail `fuel.fuel_transactions` row (voided by #28661 as a second record of a purchase another rail records). The worker's list (`listRelayFillDocumentsWithoutRecords`) looked only for LIVE records, so it re-tried the write every run; the insert collided with the voided row's `source_row_hash` `relay-line:<company>:<line id>` (`fuel_tx_source_row_hash_uk`). Fix: the list leaves out a fill whose line hash is already taken, a 23505 on that index is outcome `already_recorded` (done), and a fill refused by name (audited `fuel.relay_fill_record_refused`) is logged with its reason and no longer fails the run; only an unexplained non-link throws. Guard `verify-relay-fill-records-idempotent` (step 20065), test `fuel/__tests__/relay-fill-records-idempotent.test.ts`.

The 3 named fills, measured against prod 11-10 04:15Z with the fixed list query (13 voided-duplicate fills drop out, these 3 remain): txn_EE9rkFekb8YWD4 — document has no truck/driver, Relay matched both (`matched_unit_id`, `matched_driver_id` set); txn_2gAW9V27xqzpYB — document has a truck, Relay matched the driver; txn_8LZfDKWFvFv1oD — two DEF lines. All three are handled by the existing rules already on main (ACCT-F11125: provider match for truck and driver; DEF lines at the same unit price merge to one row). They post on the next 06:00 CT run; if one still refuses, it is audited by name and the run stays green.

Before → after (`fuel.relay_fill_records`): never succeeded, 16 refusals per run → 3 candidates per run (13 skipped as already recorded); first success recorded on the first run after deploy (expected 11-10 06:00 CT, 12:00Z) — re-measure then.

## 2 · Engines fixed today (claude lane)

- ACCT-F11120 #28677 `3a3f7e8b` — FMCSA random draw, `$1` one type. Guard `verify-insert-select-param-types` (step 19993).
- ACCT-F11121 #28678 `82b7d1f3` — auto-status snapshots real units only, USMCA only. Guard step 19997. DONE-LIVE (above).
- ACCT-F11122 #28682 `580c813f` — Relay fills on the Central business day. October app = Relay CSV: 112 fills / $54,553.79, 0 in app not in CSV, 0 in CSV not in app (re-measured 01:25Z). Guard step 20001.
- ACCT-F11123 #28683 `f7642ab6` — money crons + relationship scorer run USMCA only: depreciation auto-post (+ cash-flow snapshot / rolling ledger / held-expense retry), factoring default-interest accrual, collections sync, bank drift alerts, settlement auto-pay, insurance late fee + reminders. Guard `verify-engines-run-live-companies-only` (step 20013); 36 non-money engines pinned shrink-only.

## 3 · Relay items

- (a) Deposit txn_3We2qYty9MfNn8, $800.00 + $26.00 fee = $826.00, 10-20 18:30 CT, card 7941 — HELD. `relay_deposits.classification = unclassified`, not posted, bank line 3f102737 `pending_categorization`. 7941 is not in `integrations.relay_company_cards` (16 cards) nor `RELATED_PARTY_CARD_MAP`. No $800 / $826 charge in any USMCA bank feed 10-17..10-26 (only the Relay wallet line itself). 7941 also funded two canceled $3,613.75 deposits on 10-09. OWNER: name the card 7941 owner.
- (b) The 5 October fills in the app but not in the CSV — resolved by #28682: they were Sept 30 evening CT fills. Now 112 = 112.
- (c) The $5 — txn_9uASdgwadAXAzL (lumper, Smithfield Tar Heel NC, 10-01 22:48 CT, reefer 10224). Stored 10-11 as paid $265.00 (fee inside); the owner CSV import 11-10 00:57Z rewrote it to paid $260.00 with fee $5.00 kept in its own `fees[]` entry (audit.row_changes; audit_event 79481901). Wallet bank line da78e1b1: $270.00 → $265.00 (fee had been counted twice). October before $54,558.79 → after $54,553.79. The lumper has no expense document, no fuel record and no JE — the $260 lumper and the $5 fee are not posted yet.

## 4 · Register rows still open (no engine run can close them)

| Row | Item | Blocker |
|---|---|---|
| ENG-04 | 2170 $2,575.96 / 12 advance legs | OWNER picks bank lines (3 reclasses $705.97) |
| ENG-17 | 1090 $170,210.48 / 2510 $187,894.21 | OWNER Faro purchase matching; no balancing JE |
| ENG-25b | Transportation diesel on USMCA docs → 8000 | needs the signed documents (owner Mac) |
| ENG-38 | 24 USMCA periods open | OWNER names the months |
| ENG-48 | fuel-expense one-to-one / duplicate pairs | OWNER 11-02: build first, match later; pairs = ACCT-F11107 |
| ENG-54 | T122/T124/T156 ownership | OWNER truck list |
| ENG-60 | drop insurance.lawsuit (0 rows) | OWNER AUTH to drop |
| ENG-29 / ENG-53 | real miles / overlapping dispatch dates | OWNER yard rule + source documents |
