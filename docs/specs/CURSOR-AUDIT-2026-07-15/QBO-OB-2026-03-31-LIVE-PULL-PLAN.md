# QBO Opening Balance — live pull plan (as_of 2026-03-31)

**Status:** PLAN ONLY — no JE post, no flag flips, no TMS→QBO write-back.  
**Depends on:** #2539 Step-2 `mdata.qbo_*` merge.

## Locked decisions
- OB as-of **2026-03-31**; parallel books live **2026-04-01**
- ASC **470-60** (not 852)
- Entities: TRANSP realm `123145885549599`; TRK realm `1432746210`; USMCA not connected

## Code anchors (repo)
- TMS Balance Sheet: `apps/backend/src/accounting/balance-sheet.routes.ts` / `balance-sheet.service.ts` (`as_of_date`)
- Account balances: `apps/backend/src/accounting/account-balances.service.ts` (`fn_account_balances_as_of`)
- Comparison / cash-basis: `apps/backend/src/accounting/comparison-report.service.ts`
- Step-2 mirrors: `mdata.qbo_*` (after #2539) — do not invent balances from account lists alone

## Implementation slice (next PR after #2539)
1. Read-only `qboReport` BalanceSheet + TrialBalance for each connected realm, `as_of=2026-03-31`
2. Persist preview artifact (JSON/CSV in docs or staging table) — **no GL post**
3. Diff vs TMS `getBalanceSheetReport` / trial balances for TRANSP
4. Owner/CPA approve → separate HOLD PR for OB JE

## Owner ceremony
1. Merge #2539
2. Confirm QBO tokens healthy for TRANSP/TRK
3. Run preview endpoint / script (to be built) — review totals
4. Approve JE PR only after CPA sign-off
