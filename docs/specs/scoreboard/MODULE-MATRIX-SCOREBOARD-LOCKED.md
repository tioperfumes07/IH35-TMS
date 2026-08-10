# MODULE MATRIX SCOREBOARD — DESIGN LOCKED

**Owner approved:** 2026-08-08 CT (“yes that is exactly it”)  
**Live requirement (owner 2026-08-08):** truly live / real — auto-moves on merge + deploy; fed from Cascade audits, reconciliation, Neon proofs, scenario certs — not hand-typed %.  
**Pixel / layout preview:** `MODULE-MATRIX-SCOREBOARD-PREVIEW.html` (Maintenance sample)

## Shape (non-negotiable)

1. **One Program shell · ~26 module boards** (open one module at a time).
2. **Per module:** left = that module’s tree (tabs → sub-tabs → create surfaces). Top = **only** columns that module can need — **linkage atoms + money/econ + chrome (pickers / QBO style) + wiring (connectivity / reverse link) + process cards** — not the full system wall. Owner 2026-08-08: pickers, QBO chrome, and small wiring details are **part of** full linkage / connectivity / wiring, not optional polish after the matrix.
3. **Each cell = 4 boxes:** Required · Audited · Built · Live — owner state law (**2026-08-10 lock** supersedes 2026-08-08 3-box):

| State | Box 1 Required | Box 2 Audited | Box 3 Built | Box 4 Live | Meaning |
|---|---|---|---|---|---|
| N/A | · | · | · | · | Column does not apply — not in % |
| Required, **not audited** | **✓** | **✕** | **✕** | **✕** | Owes the wire; never audited |
| Required, **audited / in progress** | **✓** | **●** | **✕** | **✕** | Audit/mapping exists; not built |
| Required, **built / wired** | **✓** | **✓** | **✓** | **✕** | Neon probe / FK / guard / route — not click-proven |
| Required, **live verified** | **✓** | **✓** | **✓** | **✓** | PROD-VERIFIED ledger leaf×column (V2/V3/V4 exercised) |

- Box 2 **yellow (●)** = audit/mapping evidence only (ledger FAIL/FIXED, GUARD, wave, checklist item) — **not** live verify.
- Box 3 **Built** = request-time `live_scenario_probe` hold and/or wired Neon density — **never** from checklist N/M PASS alone.
- Box 4 **Live** = `AUDIT-COVERAGE-LIVE` **PROD-VERIFIED** on that leaf×column only — visual/app click-through tier.
- **Module certification %** = Box 4 Live ÷ Required (honest bar). **Built %** = (Box 3 + Box 4) ÷ Required. **Build queue** = Required − Live.
- A cell may show **✓ ✓ ✓ ✕** (coded/wired/Neon-proven but not yet live-click verified) — that is honest, not a defect.
4. **Module rail order** = sidebar order in `docs/specs/scoreboard/matrix-module-order.json` (Home → Tasks → Fuel → Dispatch → … → System). First pill = **All modules** (system rollup).
5. **System board** = `/program/matrix?scope=system` · `GET /api/v1/program/module-matrix?scope=system` — all module boards in one wide page with **summed** Required / Audited / Built / Live cells and per-module rows. Wide horizontal scroll is expected.
6. **% math:** leaf row % = Live ÷ required on that row; module = Live ÷ required on that board; **system** = sum(Live cells) ÷ sum(Required cells) across all modules with required maps.

## Live feed contract (what moves each box)

| Box | Meaning | Source of truth (existing) | When it moves |
|---|---|---|---|
| **1 Required** | This column applies to this leaf | Committed **applicability matrix** (authored once from arch design + routes; Cascade FAIL rows can *propose* Required) | Rarely — only when product surface/law changes |
| **2 Audited** | Cascade/repo audit exists (FAIL/OPEN/FIXED, wave-queue, guard named) — yellow until Built | Repo + ledger + GUARD-WORKORDERS + wave-queue | On **PR merge** / audit append |
| **3 Built** | Wired + Neon probe hold (FK/route/guard/TMS-native density) | `live_scenario_probe` request-time Neon + probe map | On **probe refresh / deploy** |
| **4 Live** | PROD-VERIFIED leaf×column (click-through tier) | `AUDIT-COVERAGE-LIVE` PROD-VERIFIED only | On **GUARD live verify / ledger tier upgrade** |

### Already-built pipes to reuse (do not invent a parallel truth)

- `GET /api/v1/program/audit-scoreboard` — ledger live + classScoreboard from `wave-queue.json` + recentActivity from git log
- `GET /api/v1/home/scenario-tracker` + `scenario.certify_cron` → `audit.scenario_status`
- `scripts/scoreboard-from-live.mjs` / `live_scenario_probe` — TMS-native Neon probes
- `docs/audit/AUDIT-COVERAGE-LIVE.md` + `scripts/audit-coverage-scoreboard.mjs`
- `docs/module-completion/*.json` (N-of-M items — leaf-level, not module blob)
- CI verify-steps / GUARD live samples (Mapped + Done evidence)

### Auto-refresh law

- Board polls the **same** Program API cadence as today’s scoreboard (request-time read).
- Merge → main deploy SHA on healthz → next poll sees Mapped/Done changes.
- Cert cron (~5m) advances scenario/Neon-backed Done cells without a human.
- **Forbidden:** hand % · committed green without live probe · GitHub API as sole activity feed.

## Not this board

- Legacy 13-gate / blocks certification board → `/program/legacy-scoreboard` (archive).
- Scenario Tracker (24 process slices) → `/program` (separate live surface; matrix **consumes** its certs for Done).

## Data inventory (honest — 2026-08-08; MATRIX-LIVE-RAD update 2026-08-08)

Legend for the matrix build: **HAVE** · **YELLOW** (have source, not yet wired into matrix cells) · **MISSING**

| Box | Do we have the data? | What exists today | Gap |
|---|---|---|---|
| **1 Required** | **HAVE** (10 modules through Drivers) | Same paths — **Dispatch depth (2026-08-09):** ≥40 leaves from DispatchSubnav + home Overview/Kanban/List/Round Trips + planners + queues + load-drawer tabs (not a 6-leaf stub) | Remaining ~16 |

### Column groups (every module board may subset)

| Group | Examples | Counts toward Done only when |
|---|---|---|
| **linkage** | Driver · Customer · Vendor · Unit · Trailer · Load | Live both-way FK / EntityLink prove |
| **money** | AP/Bill · Expense · GL/JE · Inventory · Liability/Escrow | Live money terminus / balanced JE where owed |
| **chrome** | **Picker +Add new** · **QBO chrome** (ParityDrawer, calendar, Due, +Create, no box-in-box) | Live V1/V2 click-through |
| **wiring** | **Connectivity** (nav→route→API→canonical) · **Reverse link** | Live V3/V4 |
| **process** | `scenario.*` slices | `live_scenario_probe` holds |
| **2 Audited** | **HAVE (projected)** | Same API ← ledger + GUARD + wave + module-completion **leaf×column only** (no module-wide keyword flood) | Yellow ≠ live verify |
| **3 Done** | **HAVE (strict)** | Same API ← `live_scenario_probe` hops via `PROBE_DONE_MAP` + PROD-VERIFIED ledger + Neon completion PASS; meta carries git tip + recon as-of | Money/linkage Done still needs leaf-scoped live proof where no hop exists |

**Bottom line:** Maintenance matrix is live (not SAMPLE). Done green is rare and honest. Other modules still need Required maps + the same projector.