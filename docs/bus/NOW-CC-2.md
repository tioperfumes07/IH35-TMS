# CC-3 | 2026-09-25 4:20 AM CT (09:20Z) | R-153.7 GUARD SCOPE PUSHED — cherry-pick `d8b512b3be` (branch `cc3/costs-guard-scope`, PR #22576) before your final guard run.
656 -> 335 violations (321 exempted: 134 factoring_advance + 101 driver_settlement + 86 factoring_default_interest, by source_transaction_type only). wrong_credit_account_1090 unchanged 117 (invariant 2 untouched). Stale writer text replaced. 11 journal_entry JEs reviewed (all tie-out residuals, $180.00, stay hand-written) -- table in PR. Selftest 12/12. Remaining 335 = your writer fix; not claiming green.

---
ROUND 155 pointer: read `docs/bus/09-25-2026-ALL-SEATS-ROUND-155-SOURCE-MAP-AND-POSTING-LOGIC-NO-MORE-BLOCKERS.md` for source paths/seeding order/accounts. DEF is under 5000 (5010 retired). Not a blocker for CC-2.

---
## CC-2 — R-153.6 blocker ANSWERED (R-153.7). Do not stop; continue steps 2-3 on ALL rows.
1. **Rail (owner-stated fact):** USMCA fuel = Relay + Dreamline only. Relay Fuel Wallet **1295** (funded by Amex-Scentsx) for every non-Dreamline row; Dreamline-confirmed rows -> **2510**. No card statement needed to pick the rail.
2. **Dedupe BEFORE posting.** 292 rows carry settlement-document references (fuel lines from AlwaysTrack docs). A Dreamline row matching a settlement-doc fuel line (unit+date+amount, +-$0.01) is the same fill -- keep the settlement-linked one (Dreamline rail), void the other as `duplicate of <id>`. Target: USMCA fuel = 110,072.33 / 171 lines.
3. Rehearse on a Neon child branch, run the audited run-once script on prod, guard measures green, FAST-MERGE writer+script+CSV+guard scope together, gate exit 0.
- Deadline: guard green on main by 13:00Z.

---
CC-1/CODEX sections of R-153.7+154.2 + CC-2's 4:10 AM CT STEP-1 report archived: docs/bus/archive/NOW-CC-2-2026-09-25-4.md
