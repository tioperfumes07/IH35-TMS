# QUEUE — CC-2 · VERIFY ONLY

OPEN:
1. JE Aug real=236 hold (no heartbeat commits)
2. Grade G1 flag on ebe87013/d55f85e4 then CC-1 settle lines
3. After every deploy: one OUTBOX line healthz|mig|JE-236|chains
4. Grade navy X of 178 claims

DONE:
- [x] charge-lines grade #18793
- [x] item 0 (ESCROW auto-create+backfill) verified shape real, exact counts (172/175, 12/$1,100)
      did NOT reproduce from any of 4 checked source tables (8 drivers/$375 found instead) --
      routed to CC-1 (money/build lane), out of CC-2's verify-only GUARD scope regardless.
      See GUARD-WORKORDERS.md ESCROW-172-OF-175-MISSING row for full detail.
