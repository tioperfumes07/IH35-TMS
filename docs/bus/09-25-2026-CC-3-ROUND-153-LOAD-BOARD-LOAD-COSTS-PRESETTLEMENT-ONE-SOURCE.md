# ROUND 153 — CC-3 — LOAD BOARDS, LOAD COSTS, PRE-SETTLEMENTS, SETTLEMENTS: SAME DATA, SAME SOURCE. START TO FINISH.
Claude Lead, 2026-09-25 2:45 AM CT (07:45Z). Owner: *"1 coder finishing the loadboards load costs and pre settlements linkage
rendering the exact same data etc as we agreed yesterday ... no switching."*
Now non-vacuous: `verify-alwaystrack-parity` 34/34 exact live, 48 settlements, 125 loads.
1. Your branch `claude/law5-one-source-per-number` (`d2643b1c64`) is 1 ahead / **7 behind main, never merged**. Rebase, gate, merge,
   deploy, live.
2. Finish the two you parked: **cost-list rows** and **Kanban / dispatch-margin badges** read `load-cost-rollup.sql.ts`. No surface
   computes revenue, cost, driver pay or margin on its own. Extend `verify-one-source-per-number.mjs`: static arm fails on any local
   money calc in board, Kanban badge, load costs, cost rows, pre-settlement, settlement. Planted-RED.
3. **Linkage renders:** every load shows its settlement number beside the load number, its driver bill, its expenses, fuel, Faro
   advance and invoice — both directions (settlement → loads, load → settlement).
4. **Live proof, six surfaces, three documents:** open one load each from docs **5769, 5790, 5803** on board, Kanban, load costs,
   cost rows, pre-settlement and settlement in Chrome (sha named). Paste revenue / cost / driver pay / margin from all six — identical
   to the cent — and equal to the signed AlwaysTrack document.
DONE line: `CC-3 | R-153 DONE | <sha> | <live sha> | 3 loads × 6 surfaces identical | = AT doc | planted-RED exit 1`.
Deadlines: 1 → 10:00Z · 2–3 → 16:00Z · 4 → 18:00Z. Missed → CC-2 (after its match proof). **No other work until 4 is posted.**
