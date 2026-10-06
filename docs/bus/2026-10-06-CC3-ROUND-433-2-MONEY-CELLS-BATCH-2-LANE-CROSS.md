# LANE_CROSS — CC-3 — ROUND 433 item 2, batch 2: money cells 76 → 55 (2026-10-06)

**Authority:** Lead ROUND 433-CC3 item 2.

**How the 21 break down. Most of this is a correction to the count, not wiring, and is reported as such:**
- **2 wired.** The Chart of Accounts book balance drills to the account register through the page's as-of date. The bank balance opens the feed account.
- **5 were never cells.** A `className` on an input (NumberInput, a MoneyInput row, the opening-balance field, a Book Load field, a WO reconcile field) is a field to type into, not a figure to click through. The guard now decides this by the element's tag.
- **14 were never money.** ProgramTracker counts and timestamp, HOS minutes, a service interval, the escrow progress %, the escrow account count, and the reclassify "applied/requested" tally. Each now carries `data-quantity`, an explicit and reviewable claim. The guard exempts only the element that carries it; the selftest proves a sibling's marker does not exempt the next cell.

**Engine defect found and fixed — the Chart of Accounts bank balance:**
- It matched a feed account to a GL account by fuzzy name, and only for Asset accounts.
- So a credit card could never show its balance: Amex-Scentsx and Dreamline Diesel Card are Liability-backed.
- And one account's feed could be pinned on another account whose name merely contained it.
- The match is now `bank_accounts.ledger_account_id`, which the plaid accounts endpoint now returns. A feed linked elsewhere is never borrowed by name.

**Files:**
- `link.routes.ts`, `api/banking.ts`, `coa-list-utils.ts` and its test, `ChartOfAccountsListPage.tsx`
- `verify-money-cells-click-through.mjs` (element rules + 5 selftest cases)
- the 6 quantity-cell files

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
