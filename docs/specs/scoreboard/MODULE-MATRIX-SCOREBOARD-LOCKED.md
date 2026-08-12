# MODULE MATRIX SCOREBOARD — DESIGN LOCKED

**Owner approved:** 2026-08-08 CT (“yes that is exactly it”)  
**Final definitions (owner reconcile 2026-08-11):** §FINAL DEFINITIONS below — supersedes any conflicting checklist JSON, scenario dot, or chat claim.  
**Coder entry (purge 2026-08-11):** `CODER-START-HERE-LOCKED.md` · Desktop `00-CODER-START-HERE.md` — only valid read order.  
**Vertical wire method:** `VERTICAL-COLUMN-WAVE-METHOD-LOCKED.md` — column waves A→D across priority modules; Live (Box 4) **after** full wire + system test.  
**Pixel / layout preview:** `MODULE-MATRIX-SCOREBOARD-PREVIEW.html` (Maintenance sample)

---

## FINAL DEFINITIONS (reconcile — authoritative 2026-08-11)

These resolve scoreboard dishonesty. **When sources disagree, this table wins.**

| Source | What it measures | Counts as “done”? | Common lie |
|--------|------------------|-------------------|------------|
| **`docs/module-completion/*.json`** `complete:true` | Checklist items PASS (often chrome/list-error) | **NO** for linkage or economics | “Accounting complete” while matrix Live ≈ 0% |
| **`live_scenario_probe` / scenario dot** | TMS-native **row count** (e.g. “2 claims”) | **NO** for deep linkage | Green `scenario.insurance` while claim hub FKs all NULL |
| **Matrix Box 1 Required** | Column applies to leaf (`*.required.json`) | N/A — applicability only | — |
| **Matrix Box 2 Audited** | Ledger/GUARD/wave row exists for leaf×column | **NO** — mapping only (yellow ●) | Treating audit FAIL as fixed |
| **Matrix Box 3 Built** | **Wire sprint target:** guard shipped in `wire-sprint-built.json` + guard file on disk; forward writer + reverse nav assumed by guard | **YES for “wired”** during build phase | Scenario row-count probe · checklist PASS without guard |
| **Matrix Box 4 Live** | **After system test:** PROD-VERIFIED click + Neon on deployed SHA | **YES for “certified”** | CI green · merge · Built mistaken for Live |
| **Desktop audit packs** | Owner click-through inventory | Input to Required map · **not** auto-green matrix | Re-auditing during wire sprint |

**Certification % (honest)** = Box 4 Live ÷ Box 1 Required (per module or system rollup).  
**Wire progress % (honest during sprint)** = Box 3 Built ÷ Box 1 Required.  
**Build queue** = Required − Live (not Required − checklist PASS).

**Insurance §B9** = **depth model** for every module (forward + reverse + economics). It is **not** the instruction to build insurance first; it defines how deep each leaf×column must be when marked Built/Live.

**Weekend merge verification** = `cursor-ship-preflight` / `money-pr-local-gate` PASS + OUTBOX gate line — **not** GitHub Actions while checks are down. Admin merge is UI only. Local gate ≈ same teeth as pre-push CI; full remote `build-typecheck` resumes when Actions returns.

## Shape (non-negotiable)

1. **One Program shell · ~26 module boards** (open one module at a time).
2. **Per module:** left = that module’s tree (tabs → sub-tabs → create surfaces). Top = **only** columns that module can need — **linkage atoms + money/econ + chrome (pickers / QBO style) + wiring (connectivity / reverse link) + process cards** — not the full system wall. Owner 2026-08-08: pickers, QBO chrome, and small wiring details are **part of** full linkage / connectivity / wiring, not optional polish after the matrix.
3. **Each cell = 4 boxes:** Required · Audited · Built · Live — owner state law (**2026-08-10 lock** supersedes 2026-08-08 3-box):

| State | Box 1 Required | Box 2 Audited | Box 3 Built | Box 4 Live | Meaning |
|---|---|---|---|---|---|
| N/A | · | · | · | · | Column does not apply — not in % |
| Required, **not audited** | **✓** | **✕** | **✕** | **✕** | Owes the wire; never audited |
| Required, **audited / in progress** | **✓** | **●** | **✕** | **✕** | Audit/mapping exists; not built |
| Required, **built / wired** | **✓** | **✓** | **✓** | **✕** | Wire-sprint guard shipped — not click-proven |
| Required, **probe density only** | **✓** | **●** | **✕** | **✕** | Neon row-count / scenario hold — **not** Built |
| Required, **live verified** | **✓** | **✓** | **✓** | **✓** | PROD-VERIFIED ledger leaf×column (V2/V3/V4 exercised) |

- Box 2 **yellow (●)** = audit/mapping evidence only (ledger FAIL/FIXED, GUARD, wave, checklist item) — **not** live verify.
- Box 3 **Built** = `wire-sprint-built.json` + guard on disk — **never** from checklist N/M or scenario row-count alone.
- Scenario / Neon **probes** = Box 2 **Audited ●** only (density signal) — forbidden on Box 3.
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
| **3 Built** | Wired guard shipped (Wave-A feed) | `wire-sprint-built.json` + guard file exists | On **guard merge** + feed entry |
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