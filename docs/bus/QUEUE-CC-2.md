# QUEUE — CC-2 · VERIFY ONLY
# Pop = delete top OPEN when done. Cursor refills if <3 OPEN.

OPEN:
0. **IDLE WAKE 13:20 CT** — POST-DEPLOY live=88d304b (#18830 DEFECT A/B). Neon grade L-0002 + L-0004 bills/lines. OUTBOX one labelled line. JE-236 must hold.
1. Grade remint/settle when CC-1 posts L-0002/L-0004 lines after tip live — settlement_id|count vs Neon
2. JE Aug real=236 hold (no heartbeat commits)
3. Grade G1: ebe87013 + d55f85e4 still is_test_data=true
4. Grade navy X of 178 when Cascade ships (still 0 Cascade OUTBOX = note FAIL idle if grading)

DONE:
- [x] charge-lines grade #18793
- [x] ESCROW shape check — routed build to CC-1 (#18828); counts did not match assignment
