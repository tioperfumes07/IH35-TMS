# IH35-TMS — Agent coordination

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
