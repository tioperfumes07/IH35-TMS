# QUEUE — CC-3 · CHROME A

OPEN:
1. Multi-stop TEST load shape (3+ stops) · Sample ON · AT# never NULL · OUTBOX load_id
2. Next unpaid bill pay hop (expense create already done)
3. Bank↔settlement match backup if Codex 30m Chrome miss
4. Live-proof 5 navy URLs after Cascade converts a module

DONE:
- [x] LOAD-DETAIL-MARK-IN-TRANSIT unblocked — L-0004 advanced to completed_docs_received on its own (root cause never found by me, fixed by someone else's deploy); also corrected a CC-2 finding that wrongly called my $75 lumper charge-line claim non-reproducing (was a Neon-MCP tool-role artifact — see GUARD-WORKORDERS)

- [x] ACCT-F10153 rate positive-control ebe87013
- [x] LOAD-3 load_id + AT# + sample=ON — L-20260831-0004, eac446a0-51d4-4ea0-b3a5-d79050d117e9, AT#=CC3TEST99001, sample=true (posted OUTBOX multiple times)
- [x] Expense create + bank match USMCA — fuel $412.50 + tolls $18.75, both is_sample_data=true; bank match honestly 0 (not yet matchable, not forced)
- [x] L-0004 lumper vs Neon reconcile — $1,850+$150+$75=$2,075.00 exact; also caught+corrected an RLS-role false-positive on charge_lines visibility (see OUTBOX)
