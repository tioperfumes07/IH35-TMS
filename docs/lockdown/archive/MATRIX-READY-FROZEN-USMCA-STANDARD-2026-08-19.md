# MATRIX READY STANDARD — FROZEN USMCA OPS (owner 2026-08-19)

**SUPERSEDED IN PART (owner 2026-08-20):** **Do not park money.** Frozen / Miss C / READY include **money-group** Required cells. Clicked on AP/BILL, BANK, EXP, GL/JE, INV, AR, LIAB is **in** the 100. TRANSP QBO parallel books stay parked (no TMS→QBO write-back). USMCA money Chrome **is not parked**.

**Answered = closed. Do not re-ask. Do not add Required leaves until READY is ✓.**

**Operating company for this close-out:** USMCA only. TRANSP QBO parallel books / TMS→QBO linkage are **parked**. They do not block READY. USMCA money cells **do** block READY.

**Denominator:** current `docs/specs/scoreboard/modules/*.required.json` — **frozen**. No new leaves, modals, or Required cells until Jorge unfreezes.

---

## The 100 you watch

| Column | 100 means | Use as “done”? |
|--------|-----------|----------------|
| **READY** Live ✓ | Every Required cell (including **money**) is **Built** and **USMCA Clicked** | **YES — this is ready** |
| **Miss C** | Integer unpaid **Box 4 Live** on the frozen Required set (including money). Clicked 100% does **not** zero Miss C. | **0 = every Frozen cell is Live** |
| Built | Guard on disk for Required cell | No |
| Box 4 Live | Ledger fan-out | **Never** |
| Named | `` `leaf:col` `` on PROD-VERIFIED | No |
| Clicked (all cells) | Includes money-group cells | Same set as Frozen / Miss C / READY |
| MONEY atoms | On the board and in READY | **Not parked** — Devin Clicked + CC-1 economics |

**Clicked credit (USMCA):** OUTBOX `LIVE PASS` + `leaf=<module>:<leafId>:<col>` with USMCA on the line, **or** ledger `LIVE PASS · 1–3 Exact cells` + USMCA. Fan-out rows with 4+ Exact cells do **not** fill Clicked.

**True missing:** **Miss C**. True progress: **Ops click / Frozen**.

When Miss C = 0 and READY ✓, **this frozen USMCA ops map is closed**. New leaves later = new freeze.

---

## Seat work (non-stop, FAST-MERGE, urgent 16)

Urgent 16 (A–Z): accounting, banking, cash-flow, customers, dispatch, drivers, factoring, finance, fleet, insurance, legal, lists, maintenance, safety, settlements, vendors.

| Seat | Does | Does not |
|------|------|----------|
| **Cursor** | Lead · INBOX truth · Built/EntityLink leftovers on fleet+maint · matrix READY wiring | Steal Codex reverse files · Box 4 as done |
| **Codex** | Reverse + connectivity FE on 14 (customers→drivers→vendors→**dispatch PRIMARY**) | Safety Live re-loop · money |
| **Devin-A** | Clicked Live Cancel-only, `leaf=module:leaf:col`, healthz SHA, seq through 14 | Safety PASS re-loop · treating Box 4 as Clicked |
| **CC-1** | Accounting money/GL unpaid on 14 → banking → settlements → factoring | verify:static wander · EntityLink-only · 18:20Z INBOX |
| **CC-2** | Lists pickers unblocking customers → drivers catalogs → vendors catalogs | Skip gate · steal reverse/money |
| **CC-3 / Cascade** | OFF | Build |

`--no-verify` only after `money-pr-local-gate` / `cursor-ship-preflight` **exit 0**, and only for ENV `verify-static-fallback`.
