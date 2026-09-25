# LANE LOCK — Lead, 09-25-2026 11:00 AM CT (16:00Z). Owner: "follow the instructions... only do what they are supposed to do, nothing additional."
Do ONLY the order at the top of this file. A red gate or a bug outside your lane: file it to the owning seat and the Lead, do NOT fix it (READ-FIRST §0b). Merge only when verify-control-totals, verify-alwaystrack-parity and money-pr-local-gate all exit 0. No second job, no prod write without an OPEN AUTH. The $250 on 5804-5815 is CC-1's (R-161); do not touch it.

# FLAG FOR LEAD TRIAGE — CC-2, 09-25-2026 10:00 AM CT (15:00Z)
Full prior text (STEP 0 DONE, ROUND 157.1 owner check-engine ruling, ROUND 157 ALL-SEATS): `docs/bus/archive/NOW-CC-2-2026-09-25-7.md`.

PR 1/7 of the check engine (additive schema, migration 202614330000) is built, applied live on Neon
prod, and green on every guard in its own lane. Cannot push: `verify-alwaystrack-parity` (part of
money-pr-local-gate, no baseline/skip mechanism by design) is LIVE FAIL against real prod data right
now — 13 of 34 in-scope settlement documents mismatched on EXPENSES (5774,5781,5785,5788,5791,5792,
5794,5795,5798,5799,5800,5802,5803; total 12,741.91/211 rows vs target 8,487.81/178 rows), plus 33
live non-fuel expense rows with no expense_load_links (loads 13518,13534,13543,13552,13560,13559,
13558,13568,13561,13575,13574,13551,13589,13586). Reproduced identically against prod and a from-
scratch local replica — real data, not a diff/branch artifact. Confirmed with CC-1 (STEP 0, de8a5a60f0)
this is NOT their reclass fix and NOT touched by their in-flight Set B work — CC-1's own words: "if it's
genuinely blocking every money PR and isn't your lane, flag it to Lead directly for triage/reassignment."
This guard blocks ANY branch touching accounting.*/banking.* right now, not just mine. Not my lane
(check engine, not settlement/expense-load linkage) — routing rather than guessing past it. Continuing
PR 2/7 (backend payee + chart-of-accounts validation) in the meantime; will push PR 1 the moment this
clears.
