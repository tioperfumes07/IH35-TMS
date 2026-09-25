# NOW-CC-1 — archived 2026-09-25 (size-cap trim #5, CC-1 self-performed, WORM). Full prior history
(both open DECISION NEEDED items in full, items 5-10 DONE lines): `docs/bus/archive/NOW-CC-1-2026-09-25-5.md`.

# 2 DECISION NEEDED items still open (full text in the archive above):
1. Item 6: 4 of 5 self-carried invoices ($9,412.40) blocked on USMCA's live
   INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE flag refusing any load-less invoice send.
2. Item 11: does LAW.md's "no USMCA backfill" law cover self-referential completion of a USMCA
   expense's own unit_id/driver_uuid/trailer_id from that SAME expense's own already-linked USMCA
   load (373 expenses, 112/66/293 missing each field respectively)?

CC-1 | 2026-09-25 6:15 AM CT (11:15Z) | R-153 ALL 11 ITEMS DONE OR REPORTED | item11 617accd136
(PR #22592): linkage measured live (loads no_unit=27 matches 07:46Z exactly; expenses
no_unit=112/no_driver=66/no_trailer=293, every one already carries load_id; driver_bills
no_settlement=9, down from 19). DECISION NEEDED #2 above blocks the actual completion write.
ROUND 153 full status: items 1 (11/13 voided, 2 factoring-blocked reported), 2 (6 receipts posted,
$485 gap named), 3 (already correct, guard only), 4 (handed to CC-2 per R-153.4/153.6), 5 (fixed,
guard now reads day_control.json), 6 (1/5 fixed, 4/5 DECISION NEEDED #1), 7 (124 loads audited, 1
finding named), 8 (7 advances disbursed + 1 real duplicate corrected via a Neon-rehearsal catch), 9
(CoA audit, 60-expense 9000-suspense finding named), 10 (5 dimensions tie exact, 2 gaps named), 11
(measured, DECISION NEEDED #2). Also landed this session: self-found + fixed a ROUND 133 P0
violation on my own two scripts.ops writers (AUTH-001 retroactive transparency record after Codex's
code fix; AUTH-002/003 issued-before-execution discipline going forward). No fuel/factoring touched
(CC-2's lane). Available for the next round's assignment; both DECISION NEEDED items remain open.
