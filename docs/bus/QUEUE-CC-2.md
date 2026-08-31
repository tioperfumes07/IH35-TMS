# QUEUE — CC-2 · VERIFY ONLY

OPEN:
0. WAKE 17:15Z — read docs/bus/GO-IDLE-WAKE-2026-08-31T1715Z.md. AFTER current item: ESCROW. 172 of 175 drivers have NO escrow account; 12 drivers already deducted $1,100 total against accounts that do not exist. Escrow = liability owed to driver. Auto-create + backfill the 12 + prove ledger sums to balance.
1. JE Aug real=236 hold (no heartbeat commits)
2. Grade G1 flag on ebe87013/d55f85e4 then CC-1 settle lines
3. After every deploy: one OUTBOX line healthz|mig|JE-236|chains
4. Grade navy X of 178 claims

DONE:
- [x] charge-lines grade #18793
