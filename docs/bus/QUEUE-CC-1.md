# QUEUE — CC-1 · MONEY + WIRING
# Pop = delete top OPEN when done. Cursor refills if <3 OPEN.

OPEN:
0. DEFECT A+B FIX — predicates NAMED (#18822). Build guard+selftest then code: (A) refresh/include driver_pay_rate_per_mile in bookLoad mint-time load; (B) completed_docs_received re-entry on pingSettlementOnLoadEvent. No remint until guard green.
1. LIVE settle after A/B fix: remint/settle L-0002 OR append line L-0004. L-0010 proven. OUTBOX settlement_id|count
2. Driver-bill mint carries per-load rate — prove remint on L-0002 or file remaining silent-skip
3. Factoring batch uses FACTOR PROFILE 97%/1.5% not hardcoded 0.95/0.025 — code+PR
4. SETL-45: next completed_docs with zero lines (state X of N) — 45-class still OPEN
5. GL verify new chain JEs · is_sample_data honest
6. FINDING+fix: Equipment Qual create UI has no TEST-data control (rates mirrored is_test_data=false) — FE+write path

DONE:
- [x] DEFECT A+B predicates named (#18822) — GO-IDLE-WAKE item 0
- [x] Rate create → driver_finance ebe87013 + d55f85e4
- [x] G1: both is_test_data=true (Neon 11:25+11:41 CT)
