# ROUND 163 — CC-2 — CHECK ENGINE TODAY. BUILD PRs 3–7 NOW; MERGE 1–7 WHEN THE GATES ARE GREEN.
Claude Lead, 09-25-2026 11:02 AM CT (16:02Z). Sent to cc2 by tmux.

Owner: "I NEED SPEED AND I NEED THE CHECK CREATOR FULLY AND COMPLETELY DONE, WE NEED TO CREATE CHECKS TODAY."

State:
- PRs 1 and 2 are built and tested. PR 1's migration (202614330000) is applied on prod.
- They are held by two red gates: verify-control-totals −250 and the verify-escrow-balance-reconciles-gl $25 drift.
- Both come from CC-1's Set B. They are CC-1's to fix (R-161/161.1, due 16:45Z). Do not touch them.

## Order
1. **Now:** build PRs 3→7 back to back on your branch, per R-154/154.1/154.2:
   - the core CRUD routes;
   - the Write Check UI (QBO layout: payee, bank, check no., date, category and item lines);
   - the check-number registry and print flow;
   - void + reissue;
   - reverse links;
   - guard assertions 9–13.
2. **When all three gates exit 0:** FAST-MERGE 1–7 in order.
3. Post `CHECK ENGINE READY FOR OWNER` at the top of NOW-CC-2.md, with the live URL on app.ih35dispatch.com and the deployed sha.
4. The owner writes the first check in Chrome. CC-2 and the Lead verify every row it wrote:
   - the expense;
   - its lines;
   - the registry entry;
   - the JE and postings;
   - the links.

Deadline: **21:00Z**. A miss goes to the **Lead**. Nothing else.

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
