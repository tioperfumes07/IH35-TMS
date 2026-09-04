# CC-1 → Cursor · 2026-09-04 · Fuel-advance / cost-account picker bugs on LoadDetailCostsTab.tsx

**Owner spec:** `09-04-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL.md` §1.2. Filed per §0b (one
seat owns one surface) — `LoadDetailCostsTab.tsx` is Cursor's file, this session's own #20309
SURFACE-BREACH ACK is spent, so this is a FIND-IT/FILE-IT, not a fix, from CC-1.

## Bug 1 — the category filter regex never matches USMCA's real account types

`apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx:100`
```ts
const categories = chart.filter((row) => /expense|cost of goods/i.test(row.account_type));
```
Live USMCA `catalogs.accounts.account_type` values are the QBO enum spelling — `CostOfGoodsSold`, no
space. `/cost of goods/i` never matches it. Verified live (bypass_rls=lucia, postable+active): 34 real
cost accounts, only 24 match this regex — the 10 `CostOfGoodsSold` rows (including `5000 Fuel &
Diesel`) never reach the Category dropdown.

**Fix:** match the account-type SET exactly (`Expense`, `OtherExpense`, `CostOfGoodsSold`), not a
free-text regex against the QBO type string.

## Bug 2 — the fuel account is picked by name, and the first name match can be an ASSET

`apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx:111`
```ts
const fuelAccount = categories.find((row) => /fuel/i.test(row.account_name));
```
Because of Bug 1, `categories` never contains `5000 Fuel & Diesel` today, so `fuelAccount` is
`undefined` and `+ Fuel advance` renders "No Fuel expense account found" — dead on arrival. But even
with Bug 1 fixed, `.find()` on a `/fuel/i` name match is itself unsafe: live USMCA also has `1250
Driver Fuel-Overage Receivable` (Asset) and `1295 Relay Fuel Wallet` (Asset) and `4100 Fuel Surcharge
Income` (Income) — all match `/fuel/i` on the name. Depending on chart order, `.find()` can resolve to
an asset/receivable account instead of the expense account. A company fuel advance posting into a
driver receivable is exactly the outcome the owner ruled must never happen (owner: "the fuel advance
from us to the driver is a company expense... he is a company driver, not an owner operator").

**Fix (owner-specified):** bind the fuel account **by role**, never by name —
`accounting.chart_of_accounts_roles` (backend resolver: `apps/backend/src/accounting/coa-roles/resolver.service.ts`,
`resolveAccountForCategory`). CC-1 is seeding the USMCA role row pointing at `5000 Fuel & Diesel` in
the same pass this finding is filed (backend/accounting is CC-1's surface); the frontend fix is a
role lookup call replacing the `.find(/fuel/i...)` line. **Missing role ⇒ the control disables and
NAMES the missing role** — never a silently dead button.

## Bug 3 — the payment-account picker falls back to every asset account on entities with no `Bank` type

`apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx` — `paymentAccounts`/`bankAccounts`
filter, currently `/asset|bank|credit ?card/i` on `account_type` (CC-1's own earlier fix this session,
PR #20357 — directionally right but not sufficient). USMCA has **zero** accounts with
`account_type = 'Bank'` literally, so on USMCA this still falls back to matching every one of the 41
`Asset`-typed accounts, receivables included — the same by-name/by-loose-type class of bug as Bug 2,
just on a different picker.

**Fix:** same prescription as Bug 2 — bind by role (a "payment account" / "operating bank account"
role), never by a type-string regex that can silently widen to the wrong account class.

## Scope note

CC-1 is NOT touching `LoadDetailCostsTab.tsx` (scope fence, spec §SCOPE FENCE). This finding is the
FIND-IT half; the FIX-IT half is yours or a new SURFACE-BREACH grant back to CC-1 if you'd rather hand
it over. `catalogs.accounts` id for the correct USMCA fuel account and the seeded role name are in
CC-1's own migration/commit landing alongside this finding — grep `chart_of_accounts_roles` after it
merges for the exact role key to call.
