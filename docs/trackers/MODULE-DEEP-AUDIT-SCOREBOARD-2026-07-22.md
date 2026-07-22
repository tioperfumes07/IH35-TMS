# MODULE DEEP-AUDIT SCOREBOARD (30 sidebar modules)

**Law:** `docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md`  
**Depth:** click-through + wizard chrome + reverse/forward links + economics/CoA (Jorge definition).  
**Statuses:** `NOT_STARTED` · `IN_PROGRESS` · `AUDITED` · `FIXING` · `DONE` · `DEFERRED` (needs Jorge + future block id)

**Owner-locked sequence (2026-07-22) — audit + fix in this order:**

| Seq | Module (sidebar id) | Status | Desktop audit file | Open fix PRs | Notes |
|-----|---------------------|--------|--------------------|--------------|-------|
| 1 | accounting | NOT_STARTED | — | #3227 dual-path recurring | **START HERE** |
| 2 | bank | NOT_STARTED | — | — | Match ↔ payment ↔ GL |
| 3 | safety | NOT_STARTED | — | — | Dual-path partially fixed earlier |
| 4 | lists | NOT_STARTED | — | — | Catalogs for all wizards |
| 5 | maintenance | NOT_STARTED | — | — | WO ↔ bill/expense |
| 6 | insurance | IN_PROGRESS | partial (A2) | #3228 HOLD | Finish deep audit + Neon HOLD |
| 7 | legal | IN_PROGRESS | partial | #3221 merged | Money path still FAIL |
| 8 | dispatch | NOT_STARTED | — | — | Loads ↔ money |
| 9 | settlements | NOT_STARTED | — | #3224 merged reverse pack | Still needs full click-through audit |
| 10 | factoring | NOT_STARTED | — | — | |
| 11 | vendors | NOT_STARTED | — | — | |
| 12 | customers | NOT_STARTED | — | — | |
| 13 | drivers | NOT_STARTED | — | — | Driver profile |
| 14 | driver-hub | NOT_STARTED | — | — | |
| 15 | fleet | NOT_STARTED | — | #3222 merged activity | Still needs full deep audit |
| 16 | cash-flow | NOT_STARTED | — | — | |
| 17 | finance | NOT_STARTED | — | — | Finance hub |
| 18 | home | NOT_STARTED | — | — | **Last wave** |
| 19 | fuel | NOT_STARTED | — | — | Last wave |
| 20 | form_425 | NOT_STARTED | — | — | Last wave |
| 21 | reports | NOT_STARTED | — | — | Last wave; Profitability ORPHAN_NEW |
| 22 | tasks | NOT_STARTED | — | — | Last wave |
| 23 | inventory | NOT_STARTED | — | — | Last wave |
| 24 | docs | NOT_STARTED | — | — | Last wave |
| 25 | users | NOT_STARTED | — | — | Last wave |
| 26 | help | NOT_STARTED | — | — | Last wave |
| 27 | program | NOT_STARTED | — | — | Last wave |
| 28 | system | NOT_STARTED | — | — | Last wave |
| 29 | eld | NOT_STARTED | — | — | Last wave |
| 30 | (compliance — not in Jorge verbal list; keep after safety or with compliance ops) | NOT_STARTED | — | — | Schedule with safety wave if needed |

**Note:** Sidebar has **30** ids. Jorge’s verbal list covers the money/ops spine first; remaining ids sit in the last wave. `compliance` stays in scoreboard — run with or right after **safety** unless Jorge says otherwise.

**Counts:** NOT_STARTED **28** · IN_PROGRESS **2** · AUDITED **0** · FIXING **0** · DONE **0** · DEFERRED **0**

**Control-plane (parallel, not a sidebar module):**

| Item | Status |
|------|--------|
| verify-reverse-drill-required guard | NOT_STARTED |
| held-migration ↔ code reconciliation guard | NOT_STARTED |
| hold-merge-gate v2 (FE gates + DO NOT MERGE) | NOT_STARTED |
| entity-scope allowlist burn-down (USMCA) | NOT_STARTED |
| sidebar docs 28→30 correction | NOT_STARTED |

Last updated: 2026-07-22 (owner module order locked)
