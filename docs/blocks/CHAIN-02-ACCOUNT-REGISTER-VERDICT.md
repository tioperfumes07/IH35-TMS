# CHAIN-02 — Account register not passing params (400) — diagnostic verdict

**Block:** AUTO-18 (LANE D · ACCOUNTING non-financial — VERIFY + wire, display only, posts nothing)
**Tracker:** CHAIN-02 (row 1110)
**Date:** 2026-06-18

## Symptom (per tracker)
The D5 account register (#976) shipped read-only; its page "isn't passing required params" so the read
endpoint returns **400**.

## Required params (backend contract)
`GET /api/v1/accounting/account-register` (`account-register.routes.ts`) validates with zod:
- `operating_company_id` — uuid (from `companyQuerySchema`)
- `account_id` — uuid
- `from_date` — `YYYY-MM-DD`
- `to_date` — `YYYY-MM-DD`
- `search?`, `type?` — optional

Any missing/malformed required field → `validationError` → **400**.

## Verified end-to-end — params ARE passed correctly (in current main)
1. **Page** (`AccountRegisterPage`) builds the query with all four required fields:
   `operating_company_id: companyId`, `account_id: accountId`, `from_date: fromDate`,
   `to_date: toDate`, gated `enabled: Boolean(companyId && accountId)`.
2. **Dates** come from `monthBounds`/`applyPreset`, both producing `YYYY-MM-DD` (via
   `toISOString().slice(0,10)`) — matches the `^\d{4}-\d{2}-\d{2}$` regex.
3. **account_id** is `accounts[].id` from `listCoaAccountsForJe()` →
   `/api/v1/catalogs/accounts?status=active` — i.e. the **`catalogs.accounts` uuid PK**, which is the
   exact id space the register service filters on (`WHERE … AND p.account_id = $2::uuid`). So it
   satisfies `z.string().uuid()`.
4. **API client** (`getAccountRegister`) serializes the query string with the **same names** the
   backend expects (`operating_company_id`, `account_id`, `from_date`, `to_date`) — no rename/drop.

Conclusion: the param-passing defect described in CHAIN-02 is **resolved in current main**. The page,
the API client, and the backend schema agree on all four required params, so a correctly-selected
account + date range returns the running balance (no 400).

## Remaining gap this block fixed (display only)
On the rare case the register request *does* error (400/404/500 — e.g. an account that doesn't resolve
under the selected company), the page previously rendered **silently**: `report` is `undefined`, so the
grid showed only the opening-balance header row with "—" and no error. That is the same "looks broken,
says nothing" failure mode CHAIN-02 reports.

`AccountRegisterPage` now surfaces `registerQuery.isError` as a clear red banner ("Couldn't load the
register … check the account and the From/To dates") instead of a blank grid. Display only — posts
nothing, no migration, no register-write path.

## Acceptance
- Required params (`operating_company_id`, `account_id`, `from_date`, `to_date`) are passed correctly →
  a valid selection loads a real running balance with no 400 (verified by code path).
- A rejected request now shows an honest error instead of a silent empty grid.
