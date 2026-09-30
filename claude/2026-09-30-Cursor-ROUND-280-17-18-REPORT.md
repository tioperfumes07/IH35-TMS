# ROUND 280 — CURSOR REPORT — 280.17 + 280.18

**Seat:** Cursor · **Date:** 2026-09-30 · **Branch:** `cursor/r255-law5-rollup-restore-c89b`

## Laws obeyed
- **280.0.a** — no Transportation writes.
- **280.0.b** — no journal entries this PR (FE wiring + guards + register only).
- **280.0.c** — linkage / one-number claims are **query/guard exit codes**, not screenshots.

---

## 280.17 — BOARD UI (register #24–29)

### Measured (Neon `br-fancy-credit-akjnd07a`, bypass_rls=lucia, USMCA)

| Signal | Count |
|--------|------:|
| status=`dispatched` | 14 |
| board === canonical (CURRENT + in-service unit) | **12** |
| finished-by-money gaps still `dispatched` | **13633, 13634** |
| InService units with pos today + no dispatched load | **T124, T163** |

`node scripts/verify-truck-line-board-shows-canonical-active-set.mjs` → **LIVE PASS — board === canonical (12)**.

### LAW-5 / 155.6 conflict closed this PR
R255 had dropped `useLoadCostRollups` to satisfy column order; that made `verify-one-source-per-number` RED.
`verify-truck-line-unit-top-level-unique` forbade the hook itself as "expenses/income."

**Fix:** hook stays wired (filter + load title only). Net is **not** a painted cell. Unique guard now forbids visible Net/expense paint and **requires** the LAW-5 markers.

Chrome (280.0.c): proves control response only after FE tip deploy — see REMAINING. Linkage already proved by the live guards above.

---

## 280.18 — FIVE LOAD VIEWS = ONE SET OF NUMBERS (query proof)

| Guard | Result |
|-------|--------|
| `verify-load-boards-agree.mjs` | **PASS** — canonical = List/Kanban = Load Costs = Truck Line (**12** loads) |
| `verify-one-source-per-number.mjs` | **OK** — SIX_SURFACES markers + live bill_lines cross-check, **0 divergences** on 81 loads |

Surfaces registered for the same rollup (`load-cost-rollup.sql.ts` / `useLoadCostRollups` / `loadCostRollupLateral`):
List · Kanban badge · Round Trips · Truck Line · Overview · Load Costs · tour-readout (pre-settlement/settlement cost rows) · driver bill tab.

History stays in Reports — board CURRENT predicate = `canonicalActiveLoadWhereClause` only (AUTH-061 48h hide retired).

---

## Files
- `apps/frontend/src/pages/dispatch/TruckLineBoard.tsx`
- `scripts/verify-truck-line-unit-top-level-unique.mjs`
- `claude/00-MASTER-PENDING-REGISTER-CURRENT.md` (#24–29 DONE-VERIFIED)
- `claude/00-ROUND-280-NUMBERED-MASTER-ALL-SEATS.md` (copied into repo)
- `claude/00-ALL-ENGINE-FIXES-ASSIGNED-BY-SEAT.md` / `claude/00-RECONCILIATION-TIED-OUT-NEVER-REDERIVE-THIS.md`

## REMAINING
- Chrome control-click after FE carries tip (280.17 control-only).
- T124/T163 owner Book Load (not a board filter).
- 13633/13634 stale status write-path (CC-3 **280.14** lane).
- Phase 3 money purge waits on CC-1 **280.5** + CC-2 factoring **280.7–280.10**.
