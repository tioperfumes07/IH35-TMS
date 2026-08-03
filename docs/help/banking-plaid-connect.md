# Connecting banks with Plaid

Banking connects institution feeds so transactions can be reviewed, categorized, matched, and reconciled inside TMS (parallel books — TMS does not write back to QuickBooks).

## Overview
- Open **Banking** → connect / accounts surfaces for the current operating company.
- Plaid (or equivalent connect flow) links an external bank account into `banking` tables scoped by company.
- Factoring and Escrow virtual banks are TMS concepts — they are not mixed into Form 425C main bank totals.

## Key tasks
- Start **Connect bank** for the correct entity (TRANSP vs TRK vs USMCA).
- Confirm the account appears on Banking Home with a feed.
- Review incoming transactions (For review / Accepted / Excluded style workflows as shipped).
- Categorize or match to bills, expenses, transfers, or journal entries per SOP.

## Tips & gotchas
- Wrong company at connect time creates orphan feeds — always check the switcher first.
- Empty For-review queues can mean the feed has not synced yet, not that Banking is broken.
- Virtual Factoring/Escrow banks stay separate from operating cash totals for DIP reporting.
