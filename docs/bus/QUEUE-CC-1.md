# QUEUE — CC-1 · MONEY + WIRING
# Pop = delete top OPEN when done. Cursor refills if <3 OPEN.

OPEN:
0. WAKE 17:15Z — read docs/bus/GO-IDLE-WAKE-2026-08-31T1715Z.md. DEFECT A (L-0002 minted 0 bills at completed_docs_received, SILENT skip) + DEFECT B (settle fired on delivered_pending_docs L-0003, skipped completed_docs_received L-0002/L-0004 — 1 of 3). Name the predicate BEFORE any remint. Guard+selftest covers both.
1. LIVE settle: remint/settle L-20260831-0002 (bills=0 lines=0 despite per-load 0.48) OR append line for L-0004 (bills=1 lines=0). L-0010 already bills=1 lines=1 — rate-card path PROVEN. OUTBOX settlement_id|count
2. Driver-bill mint carries per-load rate — code already selects driver_pay_rate_per_mile (#18770); prove remint on L-0002 or file remaining silent-skip
3. Factoring batch uses FACTOR PROFILE 97%/1.5% not hardcoded 0.95/0.025 — code+PR
4. SETL-45: next completed_docs with zero lines (state X of N) — 45-class still OPEN
5. GL verify new chain JEs · is_sample_data honest
6. FINDING+fix: Equipment Qual create UI has no TEST-data control (rates mirrored is_test_data=false) — FE+write path

DONE:
- [x] Rate create → driver_finance ebe87013 + d55f85e4
- [x] G1: both is_test_data=true (Neon 11:25+11:41 CT)
