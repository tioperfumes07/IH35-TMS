# IH35-TMS — Agent coordination

> **Rule #0 (LOCKED):** Before any work, read [docs/specs/QUALITY-STANDARD-LOCKED.md](docs/specs/QUALITY-STANDARD-LOCKED.md) — the first standing law of this project; it supersedes every other rule/doc on conflict.

## Dual lanes (always parallel when queue has work)

| Lane | Path | Role |
|------|------|------|
| A | `IH35-TMS` | Safety, Drivers, Lists, INFRA-1 |
| B | `IH35-TMS-agent2` | Dispatch, Maintenance, INFRA-2 |

## Never idle

Cursor rule: `.cursor/rules/dual-lane-never-idle.mdc` (`alwaysApply: true`)

Hook: `.cursor/hooks.json` → on **subagentStop**, injects follow-up to dispatch the next **abb** block per lane.

**Queue:** `/Users/jorgemunoz/Downloads/abb/00-TIER-2-3-DISPATCH-INDEX.txt`

**Done:** squash merge SHA on `origin/main`, branch deleted, CI green.

## If coordinator looks stale

Say: `agent is idle and stale` — or run `/loop 10m STATUS both lanes — abb queue, dispatch if idle`

## Canonical rules (tracked source of truth)

- **Sidebar / module count = 28 items**, defined in
  `apps/frontend/src/components/layout/sidebar-config.ts` → `SIDEBAR_ITEM_IDS`, enforced by
  `scripts/verify-sidebar-contract.mjs` (`LOCKED_ORDER`). The number **rendered** depends on role, and `eld`
  is a hidden stub. **Source of truth is the config array — never a hardcoded number.** (Supersedes any
  older "15 modules" / "23 items" claim in local `CLAUDE.md` or `docs/lockdown/00_LOCKED_DECISIONS.md`.)
