# QUEUE — CC-1 · MONEY + WIRING
# Pop = delete top OPEN when done. Cursor refills if <3 OPEN.

OPEN:
0. P0 G1: confirm ebe87013 + d55f85e4 have is_test_data=true (Cursor Neon-fixed 11:25 CT if still false — re-verify) THEN do not settle from unflagged rates
1. LIVE-CHROME settle completed TEST load → settlement_lines > 0 · OUTBOX settlement_id|count
2. Driver-bill mint carries per-load rate (#18770) — code+PR if still broken
3. Factoring batch uses FACTOR PROFILE 97%/1.5% not hardcoded 0.95/0.025 — code+PR
4. SETL-45: next completed_docs with zero lines (state X of N)
5. GL verify new chain JEs · is_sample_data honest
6. FINDING+fix: Equipment Qual create UI has no TEST-data control (rates mirrored is_test_data=false)

DONE:
- [x] Rate create via fixed UI → driver_finance ebe87013 (CC-3) + d55f85e4 (second)
