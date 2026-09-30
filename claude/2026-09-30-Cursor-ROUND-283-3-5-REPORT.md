# ROUND 283.3 + 283.5 — CURSOR REPORT (Lead follow-up after 8915dd1d81)

## 283.3 — Guard hardened (Lead restatement 2026-09-30)

Lead: *"no listAllLoads / GET /loads call site may omit board_scope. Fail the build, not a lint warning."*

Shipped on this PR:
1. `scripts/verify-list-loads-requires-board-scope.mjs` — **board_scope required** (status alone FAILS selftest). Also scans bare `listAllLoads(id)` and raw FE `/mdata/loads` list URL builders. `drafts_only` is the only exception. Wired in verify-step **10931** (CI build-fail). LAW.json title updated.
2. `listLoads()` client hub **throws** if `board_scope` and `drafts_only` are both absent — nothing unscoped reaches the network even if a new call site slips the static scan.
3. `useInvoiceCreateFromLoad` always passes `board_scope` (`live` for in_transit, `history` otherwise).

PROOF: `node scripts/verify-list-loads-requires-board-scope.mjs --selftest` PASS · full scan PASS.

## 283.5 — Re-check #26–#29 against corrected filter (no Chrome; query + guards)

Measured after fail-closed filter (USMCA, bypass_rls=lucia):

| Item | What it was | After corrected filter | Verdict |
|---|---|---|---|
| **#26** Return-trip double rows / unit after 176 | Suspected duplicate rows from closed+open mixes | Canonical set = **12** loads. Only multi-load unit is **T176** with **13638→13637** (DEL hinge 2026-09-28) — both still `dispatched` in the canonical active set. `data-return-trip` + unit kept still guarded. | **Not a filter symptom.** Legitimate return pair. **No new build.** |
| **#27** Column order · transit line (green, animated, centred, draggable) | Board UI | Static guard PASS: UNIT · TOUR · LOAD · PU · DEL; `#16A34A`; `onDragStatus`; CURRENT LOCATION. Truck Line uses its own SQL, not unscoped `listAllLoads`. | **Not a filter symptom.** R255 wiring still holds. **No new build.** |
| **#28** Row height · per-load dropdown · universal filter | Board UI | `truck-line-universal-filter` + status dropdown triggers still present (guard PASS). Row tracks are fixed 52/62px — viewport "16 units" was always a layout target (#24 labels), not closed-load inflation. | **Not a filter symptom.** **No new build.** |
| **#29** Responsive width | Horizontal scroll | `Dispatch.tsx` `overflow-x-hidden` + `data-testid="dispatch-page-responsive"`; Truck Line responsive `minmax(...)` grids. | **Not a filter symptom.** **No new build.** |

### What *was* a symptom of the unscoped dump (already closed by 283.1–283.4)
Board count disagreement (11 vs 14 vs 16 / five views disagreeing) — that class is **#24/#25 / 280.18 / 283.4**. Live now: `verify-load-boards-agree PASS — canonical=List/Kanban=Load Costs/Truck Line (12 loads)`.

### Bottom line for Lead
**#26–#29 do not need another UI PR after the filter fix.** They were diagnosed while boards disagreed; the disagreement was the unscoped `listLoads` else. With fail-closed + one-source at 12, the R255 Truck Line features remain the correct implementation and stay guarded. Building more UI for 283.5 would be re-work of DONE-VERIFIED R255.

NEXT: idle on 283 UI; Phase 3 still waits CC-1 280.5 + CC-2 280.7–280.10.
