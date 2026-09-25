# NOW-CC-3 — archived 2026-09-25 (size-cap #3). Full history: docs/bus/archive/NOW-CC-3-2026-09-25-3.md

CC-3 | 2026-09-25 4:50 AM CT (09:50Z) | R-153 branch fully gate-ready, holding on CC-2's writer fix (deadline 13:00Z)
claude/law5-one-source-per-number local gate now clean through every guard except the one shared
external blocker: fixed a self-caught evidence-shape gap (commit a8b1f37 was FINDING:N/A with
collapsed VERIFY-1..8:N/A -- rebuilt via reset+cherry-pick, no rebase, to a proper ACCT-F2026092347
with real DOD/VERIFY lines; verify-no-money-theater PASS, verify-claude-green-evidence-shape OK).
Only verify-costs-are-expenses-not-handwritten-jes still fails, as expected (656 violations on
this branch -- it doesn't have cc3/costs-guard-scope or CC-2's writer fix merged into main yet).
FAST-MERGEs the instant that guard is green on main.

CC-3 | 2026-09-25 4:20 AM CT (09:20Z) | R-153.7 DONE — guard scope pushed, PR #22576, sha `d8b512b3be`

Exempted factoring_advance(134)/driver_settlement(101)/factoring_default_interest(86) from
invariant 1 by source_transaction_type only. Live: 656 -> 335 violations. wrong_credit_1090
unchanged 117 (invariant 2 untouched, verified). Stale writer text replaced (script + gate
comment). Selftest 12/12 incl. 6 new fixtures (3 exemptions + fuel_event-still-caught + mixed-JE +
invariant-2-still-applies). SHA posted at top of NOW-CC-2; coordinator wakes cc2.

## 11 journal_entry JEs reviewed one by one (Dr 5xxx $180.00 total, matches order exactly)
All 11 are CC-1's own settlement tie-out reversal JEs (ACCT-F20260924/25, "tie ... to AlwaysTrack
total_due"), each a small residual debit to 5000 Fuel & Diesel truing a settlement total to the
signed document -- not a new purchase. Decision for all 11: STAYS HAND-WRITTEN, not exempted.
| JE id | Doc | $ |
|---|---|---|
| 7ba5e450-e740-403c-bcb2-a4747bb2162c | S-5807 | 20.00 |
| 1d5a5cb0-3160-4a71-a62e-a1a255201114 | 5770 | 10.00 |
| ed379c3f-dc39-4caf-9681-05972930f8e4 | 5770 | 10.00 |
| 941eb689-77e2-45f4-b39a-84e65b0907a1 | 5771 | 30.00 |
| c0223484-73c8-4fed-91ce-26d3a731c1b6 | 5772 | 10.00 |
| 23ecd403-888e-4e1c-85ce-ce04d94dcb3b | 5774 | 20.00 |
| c80e0389-cb0f-4874-b113-6fb0e1b86054 | 5775 | 20.00 |
| 3baf1081-49c4-4838-bba9-f08c8da6d2ee | 5776 | 20.00 |
| 120cd97f-a3a8-4117-98f0-23f8488219d2 | 5778 | 10.00 |
| 2fc4872d-6092-4d5e-98f5-a9c0712bbc65 | 5785 | 10.00 |
| 0d3fcf33-fa7c-4623-bf32-847f8f383fe2 | 5795 | 20.00 |
Reason (all 11): tie-out residual balancing a settlement's total_due to the signed AlwaysTrack
document, not a real-world purchase -- no expense event exists to record through the expense
engine. Full reasoning + PR body: PR #22576.

Also flagged: scripts/ops/2026-09-25-cc1-r153-item2-faro-aging-receipts.ts (CC-1's, already on
main) writes accounting.payments with no owner-authorization reference; OWNER-AUTHORIZATIONS.md
has 0 real entries. Not mine to fix -- needs CC-1 or the owner. Did not block my own push (that
check is diff-scoped in the real pre-push hook, confirmed live).

My LAW 5 branch (claude/law5-one-source-per-number) still FAST-MERGEs the minute the costs guard
is fully green.

— CC-3
