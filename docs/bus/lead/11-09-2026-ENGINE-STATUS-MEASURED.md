# ENGINE STATUS — MEASURED — 2026-11-09 7:35 PM CT (2026-11-10 01:35Z)

Scope: USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Sources: prod `_system.background_jobs` (Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, bypass `lucia`), `docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md`, `docs/bus/lead/ENGINE-REGISTER.json` (72 rows: 38 DONE-LIVE, 14 DONE, 8 PARTIAL, 7 OPEN, 5 MERGED-UNVERIFIED).

## 1 · Engine-run table (prod, 01:21Z)

- 145 engines recorded. 4 had their last run failing; 40 had no success in 2 days.
- Of the 40 stale: 32 are the QBO pull/push family (mirror pull blocked since 09-28 by the flag in `catalogs.blocked_feature_flags`); 3 run monthly/weekly and are on schedule (depreciation 11-01, insurance report 11-05, settlement auto-pay Fri 11-06); CSA BASIC pull is opt-in OFF (`ENABLE_CSA_BASIC_PULL_CRON`); and the 4 below.

| Engine | Before (01:21Z) | Fix | After |
|---|---|---|---|
| `integrations.auto_status_switch_worker` | last success 11-03 16:05Z; failing every 5 min (23503 FK) | ACCT-F11121 #28678 `82b7d1f3` + migration 202616440100 (applied 01:19:40Z) | DONE-LIVE: success 01:30:07Z; 120 USMCA snapshots / 40 units 01:25–01:35Z; 0 snapshots for any other entity |
| `safety.da_random_pool.quarterly_draw` | last success 08-16; failed 10-01 12:00Z (42P08) | ACCT-F11120 #28677 `3a3f7e8b` | MERGED — the draw is quarterly; prod PREPARE of the fixed statements passes. OWNER: Q4 draw missed; 1 of 13 active drivers enrolled → Safety › Drug & Alcohol › enroll all active, then run the draw |
| `customers.relationship_score_worker` | last success 10-25 15:12Z; USMCA rescored 11-09 (862) / 11-10 (355) with no success record | ACCT-F11123 #28683 `f7642ab6` — the worker looped all 3 entities | MERGED — proof = a success after the deploy |
| `fuel.relay_fill_records` | never succeeded; 16 refusals named every 06:00 CT run | none — 13 of 16 are the ACCT-F11107 fuel pairs (Relay-rail record voided by #28661 as a second record of the purchase; the fill document is still live). 3 refused by name: txn_EE9rkFekb8YWD4 $686.35 no truck · txn_2gAW9V27xqzpYB $232.12 no driver · txn_8LZfDKWFvFv1oD $40.89 two DEF lines | OPEN — F11107 lane |

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
