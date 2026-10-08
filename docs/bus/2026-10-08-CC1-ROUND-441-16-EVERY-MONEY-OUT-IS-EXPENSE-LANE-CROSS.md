# LANE_CROSS — CC-1 — ROUND 441.16 every money-out categorization is an Expense (2026-10-08)

**Authority:** Lead orders ROUND 441.16 #3 and 441.17 #2: "EVERY money-out is an EXPENSE document whatever the category …
Build no third case."

Files in CC-2's lane:
- `apps/backend/src/banking/bank-feed-gl-posting.service.ts`: money out to ANY account goes to the Expense path (the
  account-type gate is removed). Money in stays the Deposit path. The bare bank_categorization branch is gone.
- `apps/backend/src/banking/__tests__/bank-feed-categorize-creates-expense.test.ts`: liability, equity and asset money-out
  create the Expense.

**CC-2:** nothing to do.
