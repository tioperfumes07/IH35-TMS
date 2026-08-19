# MATRIX READY STANDARD — FROZEN USMCA OPS (owner 2026-08-19)

**Answered = closed. Do not re-ask. Do not add Required leaves until READY is ✓.**

**Operating company for this close-out:** USMCA only. TRANSP QBO parallel books / TMS→QBO linkage are **parked**. They do not block READY.

**Denominator:** current `docs/specs/scoreboard/modules/*.required.json` — **frozen**. No new leaves, modals, or Required cells until Jorge unfreezes.

---

## The 100 you watch

| Column | 100 means | Use as “done”? |
|--------|-----------|----------------|
| **READY** Live ✓ | Every **non-money** Required cell is **Built** and **USMCA Clicked** | **YES — this is ready** |
| **Miss C** | Integer unpaid Clicked on that frozen ops set | **0 = no Clicked work left on ops** |
| Built | Guard on disk for Required cell | No |
| Box 4 Live | Ledger fan-out | **Never** |
| Named | `` `leaf:col` `` on PROD-VERIFIED | No |
| Clicked (all cells) | Includes money-group cells | Progress only; READY excludes money |
| MONEY atoms | Still on the board | **Parked** — CC-1 still ships money, not in READY 100 |

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
