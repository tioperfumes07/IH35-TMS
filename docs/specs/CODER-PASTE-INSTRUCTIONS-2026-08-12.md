# CODER PASTE INSTRUCTIONS — USMCA WIRE-FIRST SPRINT (2026-08-12)

**Three seats only: Cursor · CC-1 · CC-2. No CC-3.**

**Test gate (answered=closed):** Wire all **10 priority modules** until **Box 1 + Box 2 + Box 3 are green** on every Required cell — **then** Chrome / system test / Box 4 Live. **Not before.**

**10 modules:** lists · accounting · dispatch · settlements · factoring · banking · customers · vendors · drivers · safety (USMCA).

Law: `docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md` · `docs/lockdown/USMCA-ENTITY-LAW-2026-08-12.md`

---

## PASTE → CURSOR

```text
USMCA WIRE-FIRST — CURSOR — NO IDLE

SEATS: Cursor · CC-1 · CC-2 ONLY (no CC-3).

TEST LAW (permanent):
• Wire ALL 10 priority modules first: lists, accounting, dispatch, settlements, factoring, banking, customers, vendors, drivers, safety.
• NO Chrome audit · NO system test · NO Box 4 Live until Box 1+2+3 are GREEN on every Required cell on those 10 boards (Built ÷ Required = 100%).
• THEN we test.

WIRE LAW:
• USMCA posting ON · all QBO_* OFF (no re-ask).
• Ship wiring PRs until 3-box gate met · merge on green · PR title Cursor-

YOU BUILD: routes, pickers (+Add new), EntityLink F+R, guards (EVEN), entity-scope — Cursor lane only. NOT money (CC-1).

Reply: ROLE: Cursor | 3-BOX: n% on 10 modules | MERGED: n/20 | NEXT: <one line>
```

---

## PASTE → CC-1

```text
USMCA WIRE-FIRST — CC-1 MONEY — NO IDLE

SEATS: Cursor · CC-1 · CC-2 ONLY.

TEST LAW: NO Live certify · NO Chrome money test until all 10 priority modules are 3-box green (Required+Audited+Built). Wire money columns (ap_bill, expense, gl_je, liability) across those modules first.

WIRE LAW:
• USMCA posting ON · QBO_* OFF · apply migration 202608121800 on merge.
• One money PR at a time · reuse posters · no new GL math.

Reply: ROLE: CC-1 | 3-BOX: n% | MERGED: n/20 | NEXT: <one line>
```

---

## PASTE → CC-2

```text
USMCA WIRE-FIRST — CC-2 — NO IDLE

SEATS: Cursor · CC-1 · CC-2 ONLY.

TEST LAW: Do NOT run full Chrome / PROD-VERIFIED / Box 4 Live pass until Jorge confirms all 10 modules are 3-box green. Until then: wiring samples after merge only (Neon row + healthz SHA).

YOU DO: confirm merge landed · flag samples (USMCA posting ON, QBO OFF) · write OPEN rows for Cursor/CC-1 when you find defects.

YOU DO NOT: block merges for pre-merge browser proof · certify modules Live during wire sprint · invent CC-3

Reply: ROLE: CC-2 | 3-BOX-GATE: n% | SAMPLES: n | NEXT: <one line>
```

---

## PASTE → JORGE (bus)

```text
Wire sprint: 10 modules → 3 boxes green (Req+Audit+Built) → THEN test (Box 4 Live). Three seats: Cursor · CC-1 · CC-2. USMCA posting ON / QBO OFF permanent.
```
