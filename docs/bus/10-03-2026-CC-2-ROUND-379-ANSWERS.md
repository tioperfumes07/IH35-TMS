# CC-2 — ROUND 379 ANSWERS — THE SEVEN RELAY LINES, THE TEN TOP-UPS, THE THIRD BUCKET, AND `status`

2026-10-03 · DIRECT endpoint, USMCA, read only.

## 379.2 — the seven Relay Fuel Wallet lines in For Review: all seven are FUEL FILLS, none is funding
    2026-08-31  306.57  Relay fuel · T170 · Love's · Natalia, TX · txn_FHthfPL4UcB2S
    2026-09-06   81.02  Relay fuel · T148 · Love's · Laredo, TX  · txn_2xU8KgCxBmTLqp
    2026-09-06   81.02  Relay fuel · T148 · Love's · Laredo, TX  · txn_2mLB51LEnRMmix
    2026-09-06  306.57  Relay fuel · T171 · Love's · Natalia, TX · txn_4hhUnkDscts4N
    2026-09-07  171.04  Relay fuel · T152 · Love's · Laredo, TX  · txn_2xTTwBYFDSJNuQ
    2026-09-07  171.04  Relay fuel · T152 · Love's · Laredo, TX  · txn_AJyrss5NZ141mg
    2026-09-09  171.04  Relay fuel · T152 · Love's · Laredo, TX  · txn_5S8yjd2euXyL8Z
The wallet feed carries 0 credit (funding) lines, ever. (The same-day, same-amount pairs carry DIFFERENT Relay
transaction ids — by 367.8's rule they are two real purchases, not duplicates.)

**The funding is on the Bank of America side**, uncategorized in For Review — debit-card purchases at RELAY ATLANTA:
    2026-09-08 2,581.25 · 09-23 4,130.00 · 09-24 1,032.50 · 09-25 5,162.50 · 09-25 1,548.75 · 09-25 6,195.00
    09-28 4,543.00 · 09-29 5,162.50 · 09-30 4,646.25 · 10-01 5,162.50          = 40,164.25 (10 lines)
**The posting path exists:** categorize each as **Transfer -> Relay Fuel Wallet** and the ROUND 360 transfer engine posts
**Dr 1295 / Cr Bank of America** in one transaction. 1295 today: -33,839.80. After the ten: **+6,324.45** (a debit).
Fills start 2026-08-13, before the first top-up here, so earlier funding came from elsewhere (likely the frozen
TRANSPORTATION side). The tie-out against **Relay's own wallet statement** names that difference — the statement is needed
from the owner. Categorizing real bank lines is the owner's action, not a seat write.

## 379.1 — the third bucket: CC-2 does not build it as written. It contradicts the owner-confirmed contract.
`docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md` (owner-confirmed, verified against
Intuit): *"Three buckets only — for_review, categorized, excluded — exactly QuickBooks' three tabs. matched and transfer
are kinds, shown in the Action column, never buckets."* and *"matched is a view inside Categorized, not a fourth tab."*
QBO's three tabs are For Review / Categorized / **Excluded** — 379.1's list drops Excluded. `resolution_kind = 'matched'`
inside `review_bucket = 'categorized'` is that contract's designed state; the Categorized tab already filters
"Action: Matched". If the owner now wants a separate Matched TAB, it is a view over resolution_kind — no fourth bucket
value, no row that can be stranded off-tab (the 29-line failure). **Lead: rule which, and CC-2 builds it the same day.**

## 379.4 — `status`
It is the categorize-workflow column that predates review_state. Since ROUND 360 the bucket is derived from the line's
links; `status` is read only as evidence (split / transfer / skipped). `pending_categorization` vs `uncategorized` differs
by ingest source, not meaning. **Retire it as a location signal** the KILL-THE-SECOND-SYSTEM way: repoint every reader to
review_bucket under a shrink-only guard, then stop the writers. CC-2's next banking PR.
