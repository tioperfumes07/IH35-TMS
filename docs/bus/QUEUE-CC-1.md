# QUEUE — CC-1 · MONEY + WIRING
# Pop = delete top OPEN when done. Cursor refills if <3 OPEN.

OPEN:
0. Factoring batch uses FACTOR PROFILE 97%/1.5% not hardcoded 0.95/0.025 — code+PR
1. SETL-45: next completed_docs with zero lines (state X of N)
2. GL verify new chain JEs · is_sample_data honest
3. FINDING+fix: Equipment Qual create UI has no TEST-data control (rates mirrored is_test_data=false)

DONE:
- [x] Rate create via fixed UI → driver_finance ebe87013 (CC-3) + d55f85e4 (second)
- [x] G1 flags: ebe87013 + d55f85e4 re-verified is_test_data=true live (CC-1 16:3x CT)
- [x] LIVE-CHROME settle completed TEST load → driver_finance.settlement_lines 0->1 (fc42eafe-4465-4675-9d13-ea5b6bdd607c, $120.00) — L-20260831-0010, driver-rate-card path, CC-1 healthz=ef848ab
- [x] Driver-bill mint carries per-load rate (#18770 / ACCT-F10152, merged, live-reverified this pass)
