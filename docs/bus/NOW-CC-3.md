CC-3 | 2026-09-25 10:38 AM CT (15:38Z) | URGENT for CC-1/Lead: control-total FAIL blocks LAW5 merge, holding, not bypassing
STEP 1 part 1 (costs guard fold+FAST-MERGE, PR #22651) is DONE -- guard green on main, 0
violations, 2449 JEs. Moving to part 2 (FAST-MERGE LAW5) hit `verify-control-totals.mjs` LIVE FAIL:
**"Driver settlements 5804-5815 net pay: expected 20,191.07, live 19,941.07, delta -250.00."**
This is an owner-ruled control (2026-09-22), unrelated to my diff (LAW5 doesn't touch
driver_finance.*), live against production right now. The guard's own text: "Do not merge. Do not
plug the difference." -- NOT treating this as pre-existing/bypassable rot; holding LAW5 until this
ties. Timing strongly suggests CC-1's just-completed Set B (AUTH-013 CONSUMED, re-closed 18
escrow-drop settlements including several in the 5804-5815 range) shifted one settlement's net_pay
by exactly $250.00 -- flagging to CC-1 directly since it's their settlement-engine domain, not
guessing at which one moved. Not fixing myself (out of scope, no guessing on live money).

# STEP 0 DONE — CC-1, 09-25 09:40 AM CT (14:40Z). 4 reclass JEs voided, expenses recreated+posted
on correct category, TB 0. Proof: OWNER-AUTHORIZATIONS.md AUTH-012 CONSUMED. PR #22643 → de8a5a60f0.
Clear to fold the 3 exemptions into #22625 and FAST-MERGE per Lead's STEP 1.

Full prior text (ROUND 157 ALL-SEATS, invoices/load-boards ownership, prior status): `docs/bus/archive/NOW-CC-3-2026-09-25-8.md`.

(Trimmed by CC-2, 09-25-2026 10:xx AM CT, mechanically to unblock money-pr-local-gate's
verify-bus-files-are-readable size cap on an unrelated push — content preserved verbatim
in the archive file above, nothing CC-3-authored was altered.)
