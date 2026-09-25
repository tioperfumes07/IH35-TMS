# NOW-CC-1 — archived 2026-09-25 (size-cap trim #6, CC-1 self-performed, WORM). Full prior history
(both open DECISION NEEDED items in full, ROUND 153 items 5-11 DONE lines): `docs/bus/archive/NOW-CC-1-2026-09-25-6.md`.

# URGENT FINDING (not a decision, informational + coordinated with CC-3 directly) — CC-1,
2026-09-25 6:35 AM CT (11:35Z): the 11 "tie to AlwaysTrack total_due" settlement-correction JEs
(this session's own earlier work, already reviewed once by CC-3 for the costs guard) fully reverse
each affected settlement's original pay-run-close JE, then repost a version that DROPS the
2100-00-0NN escrow line entirely — on 18 of the settlements checked, $2,650.00 gross. Also found: a
live 6x-duplicate "Escrow release" posting on driver 2100-00-027, $12,500.00 of extra erroneous
debits. Measured, not fixed — touches the exact JE family CC-2/CC-3 are actively working tonight for
the costs guard; messaged CC-3 directly with the detail rather than acting alone.
Full data + reproducible script: PR #22594 (merged cb7472ef88),
scripts/ops/2026-09-25-cc1-r153-followup-escrow-dropped-in-repost.mjs.

# 2 DECISION NEEDED items still open (full text in the archive above):
1. Item 6: 4 of 5 self-carried invoices ($9,412.40) blocked on USMCA's live
   INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE flag refusing any load-less invoice send.
2. Item 11: does LAW.md's "no USMCA backfill" law cover self-referential completion of a USMCA
   expense's own unit_id/driver_uuid/trailer_id from that SAME expense's own already-linked USMCA
   load (373 expenses, 112/66/293 missing each field respectively)?

CC-1 | 2026-09-25 6:35 AM CT (11:35Z) | ROUND 153 all 11 items done/reported (recap in archive) +
1 new, real, significant finding above (escrow dropped in settlement reposts). Both DECISION NEEDED
items and the new finding await the Lead/owner or CC-3's coordination. Continuing to watch for the
next assignment; not idle.

CC-1 | 2026-09-25 6:52 AM CT (11:52Z) | DONE: item 9 follow-up -- reclassified 2 of 10 non-fuel 9000
"Ask My Accountant" suspense lines to their own unambiguous category-map accounts (EXP-2026-00053
lumper->5310 $560.00, EXP-2026-00050 tires->5400 $64.60). AUTH-004 issued-before-execution then
CONSUMED with real proof, both in the same PR. Live JEs b699d2ac-...e64a / 6ff6b8fa-...2ff8. Trial
balance confirmed still balanced after (222,397,470=222,397,470); 9000 net now -$624.60. PR #22598
merged 58dac5383a. Remaining 3 non-fuel 9000 lines untouched (2 genuinely ambiguous misc mappings,
1 fuel-content left to CC-2). Both DECISION NEEDED items above still open, still not mine to guess
at. No further unblocked ROUND 153 work found this pass -- standing by for the Lead/owner on the
2 decisions, or the next assignment.
