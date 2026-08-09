# MODULE MATRIX SCOREBOARD — DESIGN LOCKED

**Owner approved:** 2026-08-08 CT (“yes that is exactly it”)  
**Live requirement (owner 2026-08-08):** truly live / real — auto-moves on merge + deploy; fed from Cascade audits, reconciliation, Neon proofs, scenario certs — not hand-typed %.  
**Pixel / layout preview:** `MODULE-MATRIX-SCOREBOARD-PREVIEW.html` (Maintenance sample)

## Shape (non-negotiable)

1. **One Program shell · ~26 module boards** (open one module at a time).
2. **Per module:** left = that module’s tree (tabs → sub-tabs → create surfaces). Top = **only** columns that module can need — **linkage atoms + money/econ + chrome (pickers / QBO style) + wiring (connectivity / reverse link) + process cards** — not the full system wall. Owner 2026-08-08: pickers, QBO chrome, and small wiring details are **part of** full linkage / connectivity / wiring, not optional polish after the matrix.
3. **Each cell = 3 boxes:** Required · Audited · Done — owner state law (2026-08-08):

| State | Box 1 Required | Box 2 Audited | Box 3 Done | Meaning |
|---|---|---|---|---|
| N/A | blank | blank | blank | Column does not apply — not in % |
| Required, **not audited** | **✓ green** | **✕ red** | **✕ red** | Owes the wire; never audited / not built |
| Required, **audited / in progress** | **✓ green** | **● yellow** | **✕ red** | Audited or mapped, waiting build / live proof |
| Required, **complete** | **✓ green** | **✓ green** | **✓ green** | Live-proven — only this counts as Done for % |

- Box 2 **yellow** = have audit / mapping evidence, not finished.
- Box 2 **red** = required but no audit yet → Box 3 is also red (cannot be Done).
- Done (box 3 green) only when live-proven; never from “page exists.”
4. **% math:** leaf = done÷required on that row; module = done÷required on that board; system = sum of module boards.
5. **Build queue** = required cells where box 3 is not green (red or yellow on the path).

## Live feed contract (what moves each box)

| Box | Meaning | Source of truth (existing) | When it moves |
|---|---|---|---|
| **1 Required** | This column applies to this leaf | Committed **applicability matrix** (authored once from arch design + routes; Cascade FAIL rows can *propose* Required) | Rarely — only when product surface/law changes |
| **2 Audited** | Cascade/repo audit exists (FAIL/OPEN/FIXED, wave-queue, guard named) — yellow until Done | Repo + ledger + GUARD-WORKORDERS + wave-queue | On **PR merge** / audit append |
| **3 Done** | Live-proven both-way + economics where owed | **Neon** + `audit.scenario_status` + PROD-VERIFIED ledger + recon | On **certify cron / request-time probe / deploy** |

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
| **1 Required** | **HAVE** (Maint + Safety + Insurance + Legal + Accounting + Banking) | `docs/specs/scoreboard/modules/{maintenance,safety,insurance,legal,accounting,banking}.required.json` + shared vocabulary `columns.shared.json` (includes **picker_law / qbo_chrome / connectivity / reverse_link**) | Remaining ~20 module boards still need Required maps |

### Column groups (every module board may subset)

| Group | Examples | Counts toward Done only when |
|---|---|---|
| **linkage** | Driver · Customer · Vendor · Unit · Trailer · Load | Live both-way FK / EntityLink prove |
| **money** | AP/Bill · Expense · GL/JE · Inventory · Liability/Escrow | Live money terminus / balanced JE where owed |
| **chrome** | **Picker +Add new** · **QBO chrome** (ParityDrawer, calendar, Due, +Create, no box-in-box) | Live V1/V2 click-through |
| **wiring** | **Connectivity** (nav→route→API→canonical) · **Reverse link** | Live V3/V4 |
| **process** | `scenario.*` slices | `live_scenario_probe` holds |
| **2 Audited** | **HAVE (projected)** | `GET /api/v1/program/module-matrix` ← ledger + GUARD + wave-queue + module-completion | Leaf×column precision still coarse (keyword + surface PASS) |
| **3 Done** | **HAVE (strict)** | Same API ← `live_scenario_probe` holds only (`scenario.maintenance` today) | Linkage/money columns have **no** per-column live probe yet — stay red Done until Neon/scenario proof exists |

**Bottom line:** Maintenance matrix is live (not SAMPLE). Done green is rare and honest. Other modules still need Required maps + the same projector.