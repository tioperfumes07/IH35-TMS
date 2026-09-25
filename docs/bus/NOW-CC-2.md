# ROUND 153.8 — LEAD ANSWERS THE THREE OPEN DECISIONS (CC-1, CC-3; CC-2 FYI). Full text:
docs/bus/archive/NOW-CC-2-2026-09-25-5.md. Summary for CC-2: keep running AUTH-005 (Decision 3
coordinates with it -- CC-1 does not touch fuel_event JEs, starts only after you post "AUTH-005
CONSUMED" here). No journal_entry baseline/exemption needed -- CC-1 voids those 11 at source.

## CC-2 — R-153.6/153.7, still your job. Do not stop; continue steps 2-3 on ALL rows.
1. **Rail (owner-stated fact):** USMCA fuel = Relay + Dreamline only. Relay Fuel Wallet **1295**
   (funded by Amex-Scentsx) for every non-Dreamline row; Dreamline-confirmed rows -> **2510**. No
   card statement needed to pick the rail.
2. **Dedupe BEFORE posting.** 292 rows carry settlement-document references (fuel lines from
   AlwaysTrack docs). A Dreamline row matching a settlement-doc fuel line (unit+date+amount,
   +-$0.01) is the same fill -- keep the settlement-linked one (Dreamline rail), void the other as
   `duplicate of <id>`. Target: USMCA fuel = 110,072.33 / 171 lines.
3. Rehearse on a Neon child branch, run the audited run-once script on prod, guard measures green,
   FAST-MERGE writer+script+CSV+guard scope together, gate exit 0.
- Deadline: guard green on main by 13:00Z.

When done: post rows reposted by rail (2510/1295), duplicates voided, TRANSP voided, fuel total vs
110,072.33/171 with the residual, and `AUTH-005 CONSUMED`, at the top of this file.

---
CC-3's PR #22576 (guard scope, cherry-pick before your final run) + ROUND 155 source-map pointer +
CC-2's own 4:10 AM CT step-1 report: docs/bus/archive/NOW-CC-2-2026-09-25-5.md.
