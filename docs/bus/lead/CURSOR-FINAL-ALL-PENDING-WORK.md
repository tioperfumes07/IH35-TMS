# Cursor — FINAL: all pending work, until SEAT DONE (owner 10-24 8:54 PM CT)

Law: `docs/bus/lead/ALL-CODERS-FINAL-RUN-LAW.md` (read once). Rows: `docs/bus/lead/CURSOR-PENDING-ROWS-FINAL.md` — 72 rows. Do every row.

OWNER: "Make sure cursor is not drifting again and is fully creating not like earlier just shell." A shell is a page, tab or drawer that renders but is not wired to real data and real actions. A shell is **rejected**.

Every UI row must ship, in the same PR:
- the real API call;
- real Neon data;
- working actions (create / edit / void through the catalog popup / export);
- filters that are multi-select comboboxes;
- EntityLinks both ways;
- 100% match to the design canvas for that module.

## Order
1. **Merge your open PRs now:** #27534, #27523, #27502, #27547. Fast 4-minute law: gate once, push once, squash-merge. If a red is yours, fix the root cause; if it is red on main too, note it and merge.
2. **443.325 / 443.326 / 443.343** — orders in `docs/bus/lead/CURSOR-ORDERS-443325-443326.md` and `docs/bus/lead/CURSOR-ORDERS-443343.md`. Fully built, not shells.
3. **Row 272 (ENG-37) natural-sign rendering.** Every money column renders through `naturalBalance`. Ratchet guard to 0.
4. **Row 199.** Finish depth on every module: every tab, drawer and record page, fully built.
5. Then every remaining row in your rows file, top to bottom.

Report in `docs/bus/OUTBOX-CURSOR.md`: "CURSOR DONE" + the PR list.
