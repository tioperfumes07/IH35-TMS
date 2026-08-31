# QUEUE — CC-1 · MONEY + WIRING
# Pop = delete top OPEN when done. Cursor refills if <3 OPEN.

OPEN:
0. LIVE settle proof on a FRESH load (book→dispatch→in_transit→delivered→completed, driver-rate-card path, post-A/B-fix tip 88d304b) — L-0002/L-0004 themselves are BLOCKED, see item 1
1. BLOCKED (owner/FE decision, not a coder call): L-0002/L-0004 cannot remint — backend allows completed_docs_received→invoiced|closed but the FRONTEND state machine treats completed_docs_received as terminal (no button, no Kanban lane reaches invoiced/closed — confirmed live, "Completed" is the last lane). Same root as the already-filed DISPATCH-LOAD-STATUS-FILTER-ENUM-MISMATCH-400. Did not fabricate a status flip via SQL. Full detail on board.
2. Driver-bill mint carries per-load rate — prove remint on L-0002 or file remaining silent-skip — SUPERSEDED by item 1 (same blocker)
3. Factoring batch uses FACTOR PROFILE 97%/1.5% not hardcoded 0.95/0.025 — live-verified factoring.factor rows ALREADY correct (97%/1.5%/1.5%); the 0.95/0.025 in code is a documented dead fallback. Real gap (if any) is a contractually-variable pass-through fee, not a hardcodable constant — reported, needs owner/lead answer, not a coder guess
4. SETL-45: next completed_docs with zero lines (state X of N) — 45-class still OPEN
5. GL verify new chain JEs · is_sample_data honest
6. FINDING+fix: Equipment Qual create UI has no TEST-data control (rates mirrored is_test_data=false) — FE+write path

DONE:
- [x] DEFECT A+B code+guard #18830 (ACCT-F10159/10160), MERGED + DEPLOYED (live=88d304b)
- [x] DEFECT A+B predicates named (#18822)
- [x] DEFECT A+B predicates named (#18822) — GO-IDLE-WAKE item 0
- [x] Rate create → driver_finance ebe87013 + d55f85e4
- [x] G1: both is_test_data=true (Neon 11:25+11:41 CT)
