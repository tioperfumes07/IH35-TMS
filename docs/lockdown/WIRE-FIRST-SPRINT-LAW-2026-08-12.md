# WIRE-FIRST SPRINT LAW — PERMANENT (owner-locked 2026-08-12)

**Answered = closed. Do not re-ask.**

**★ AMENDMENT 2026-08-12 19:43 CT (owner):** Create-path **trip FK wiring** (accident/expense/claim/WO/fuel trailer+load stamps) is **ahead of** matrix Required-density / inventory theater. Scoreboard Required cells are **not** Built. Canonical seat packet: `docs/bus/FINAL-CREATE-PATH-TRIP-WIRING-2026-08-12/`. PR #6290 CLOSED as theater. Quality bar: `docs/specs/OWNER-QUALITY-COMPACT.md` (Desktop `Claude.docx`).

**Vertical companion (supreme for work shape):** `docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md`

## The one-line law

> **WIRE FIRST · VERTICALLY · TEST LATER.** Complete wiring on **all 10 priority modules** (Box 3 **Built** = 100%) by **column waves A→D** extending to **all 28 modules**. **No Chrome / Box 4 Live** until 3-box gate — then test. **Within that:** create-path trip FKs before Required-map expansion.

## The 10 priority modules (USMCA · owner locked)

Wire these **completely** before any test pass (`docs/specs/scoreboard/VERTICAL-COLUMN-WAVE-METHOD-LOCKED.md`):

| # | Module |
|---|--------|
| 1 | **lists** |
| 2 | **accounting** |
| 3 | **dispatch** |
| 4 | **settlements** |
| 5 | **factoring** |
| 6 | **banking** |
| 7 | **customers** |
| 8 | **vendors** |
| 9 | **drivers** |
| 10 | **safety** |

Entity scope: **USMCA** (`5c854333-6ea5-4faa-af31-67cb272fef80`) unless a row names TRANSP/TRK.

## Three boxes green = wire complete (THEN test)

Per the module matrix (`MODULE-MATRIX-SCOREBOARD-LOCKED.md`), each applicable leaf×column has **four** boxes. **During the wire sprint only the first three matter:**

| Box | Sprint target | Test phase |
|-----|---------------|------------|
| **1 Required** | ✓ | ✓ |
| **2 Audited** | ✓ (or ● mapping) | ✓ |
| **3 Built** | ✓ (guard shipped) | ✓ |
| **4 Live** | **✕ — forbidden until gate** | ✓ PROD-VERIFIED click + Neon |

**Test gate (answered=closed):** start Chrome click-through / system test / Box 4 Live **only when all 10 priority modules show Box 1 + Box 2 + Box 3 green on every Required cell** (Built ÷ Required = 100% on those boards). **Not before.**

## Four seats only

| Seat | Role during wire sprint |
|------|-------------------------|
| **Cursor** | Bus · INBOX sync · vertical law guard · matrix auto-Built · CI/deploy |
| **Codex** | **COLUMN-WAVE A+B** FE — one column id × all owed modules per PR |
| **CC-1** | **COLUMN-WAVE C** money + money CLASS-SWEEP (serial) |
| **CC-2** | **CLASS-SWEEP** + **COLUMN-WAVE B** backend — **ships PRs**; samples until gate |

**No CC-3.** Codex owns primary mechanical FE wiring; Cursor owns bus/guards/infra — not the same lane.

## What “wire” means (DoD layers A–C + VERIFY-3 minimum)

For each ranked FAIL / OPEN row in your lane:

1. **Active path** — route mounted, component reachable, no dead twin.
2. **Submit payload** — every rendered field in the POST body (wizard depth).
3. **Linkage F+R** — canonical FKs both ways; memo-only = still FAIL until wired.
4. **Connectivity** — nav → API → canonical Neon table (entity-scoped).
5. **Guard** — ratcheting verify script that fails on the defect class.

**Not required before the 3-box gate:** Box 4 Live · PROD-VERIFIED · Chrome click-through · module `complete: true`.

## What still applies

- **CI green to merge** — local gate + tests in CI, not Jorge babysit.
- **No TMS→QBO write-back** — ever.
- **USMCA posting ON / QBO OFF** — `USMCA-ENTITY-LAW-2026-08-12.md`.
- **GUARD (CC-2)** — wiring samples after merge OK; **full Live / Box 4 only after 10 modules × 3 boxes green**

## Throughput floor (do not stop early)

Wire sprint completes when **Built ÷ Required = 100%** on all **10 priority module** boards (see `wire-sprint-built.json` + matrix API). Until then:

| Mode | Keep going until |
|------|------------------|
| PR queue | **≥ 20 merged PRs** per seat **or** 3-box gate met |
| Ledger rows | **≥ 400 OPEN FAIL rows closed** per seat **or** 3-box gate met |

If blocked → write OPEN row to `GUARD-WORKORDERS.md` → **next row same turn**. Never idle.

## Forbidden during wire sprint

- Chrome / system test / Box 4 Live **before** all 10 modules are 3-box green
- Claiming PROD-VERIFIED or module COMPLETE from code-read
- Waiting on owner for USMCA TMS posting flags (permanent ON)
- Inventing a **CC-3** seat or collapsing **Codex** into Cursor/CC-3
- **Module-deep** PRs without column-wave scope · **seat module subsets**
- Pausing after merge to ask “should I continue?”

## Paste source

Per-seat instructions: `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md`
