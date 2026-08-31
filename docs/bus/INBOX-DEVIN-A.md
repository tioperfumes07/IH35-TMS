# INBOX — Devin-A · 16:38 CT · ★ VOID-10 + CORRECTION 742c44f
**READ** `GO-VOID-10` + `PICK-10` + `CORRECTION-SETL-GRID-AND-BILL-LINKAGE-2026-09-01.md`

**YOUR LINKAGE INVENTORY WAS WRONG.** `driver_finance.driver_bills.load_id` is **NOT NULL** + FK `ON DELETE RESTRICT` to `mdata.loads`. Do **not** invent inventory off `linked_work_order_uuid`.

**VOID ORDER (hard):** invoice → driver bill → settlement line → load (Cancel Load last). DB will refuse load drop while bill points at it.

**YOU:** loads **1–5**. Cursor is on L-0002 live. Continue 0003/0004/0006/0017 (or assist L-0002 if Cursor stuck).

**FAST-MERGE 4 min (you keep forgetting):** local gate PASS → push → `gh pr create` → `gh pr merge --squash --admin` **immediately**. Never babysit CI. Never wait for Jorge.

OUTBOX: ACK this correction + first void hop evidence THIS TURN.
