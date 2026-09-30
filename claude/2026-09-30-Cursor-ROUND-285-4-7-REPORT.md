# Cursor · ROUND 285.4.7 — #63 do NOT merge `cc-3/round157d` as-is

## VERDICT: CLOSED — WILL NOT MERGE. Feature already on tip main.

## MEASURED (tip `origin/main` @ `fb2b883d65`+)

| Fact | Value |
|---|---|
| Branch tip | `60f10b6915` — DSP-F210 editable pre-settlement number |
| Tip vs main (3-dot unique) | 4 files, +123/−6 — **not** the original 57/−3,579 |
| Tip vs main (2-dot) | **271 files, −91,659 lines** — branch is stale behind tip main |
| `60f10b6915` ancestor of main? | **NO** (rewritten / superseded commit) |
| DSP-F210 on main | **YES** — PR **#23089** merged 2026-09-28 (`DispatchBoard.tsx` L599 + `presettlement-number-input-*` testids; PATCH `/settlements/:id/display-id` live) |
| Prior round157d PRs | **#22968 MERGED** (FIXA/FIXB); later DSP-F210 landed via #23089 |

## ACTION TAKEN

1. **Do not merge** `cc-3/round157d-settlement-screens`. Merging the tip would replay a −91k stale tree against current main.
2. **Do not rebase** the tip commit — the only unique intent (editable pre-settlement number) is already on main via #23089.
3. **No re-cut needed** — zero missing feature vs tip main for DSP-F210.
4. Open PR list for that head: **empty** (no open PR to close). Branch left flagged; do not revive.

## LIVE PROOF

```
git rev-list --left-right --count origin/main...origin/cc-3/round157d-settlement-screens
→ 160	1

rg -n 'presettlement-number-input|ROUND 210.*editable' apps/frontend/src/pages/dispatch/DispatchBoard.tsx
→ L599 ROUND 210 comment; L1283 data-testid=presettlement-number-input-*

gh pr view 23089 → MERGED 2026-09-28T22:12:40Z
```

## NEXT

285.4.8 (#23 dependabot + preview services).
