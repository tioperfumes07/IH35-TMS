# Lane Isolation — Git Worktree Protocol

**Locked:** 2026-06-06
**Reason:** Branch-clobber race condition caused a commit to land on the wrong lane's branch when two agents shared one working copy concurrently.

## Rule

**The canonical clone is coordinator-read-only.**

| Worker type | May use canonical clone | Must have worktree |
|---|---|---|
| Read-only audit agents (no git checkout) | ✅ YES | No |
| Any worker doing git checkout / commit / push | ❌ NO | ✅ YES |

## Block Manifest Schema Addition

Every block manifest (.block-ready.agent1.json) must include:
```json
{
  "workspace_path": "/absolute/path/to/worktree",
  "is_read_only": false
}
```

- `is_read_only: true` + shared workspace = safe
- `is_read_only: false` + workspace_path == canonical clone = CI FAIL (see guard below)

## Creating a Worktree for a Block

```bash
# From canonical clone
git fetch origin
git worktree add /Users/jorgemunoz/Documents/GitHub/IH35-TMS-<block-name> -b feature/<block-name> origin/main

# Verify
git worktree list
```

Naming convention: `IH35-TMS-<block-slug>` (e.g., `IH35-TMS-observ`, `IH35-TMS-idemp-keys`)

## Cleanup After Block Merges

```bash
# After squash-merge and branch delete on remote
git worktree remove /Users/jorgemunoz/Documents/GitHub/IH35-TMS-<block-name>
git branch -D feature/<block-name>
```

## CI Guard

`.github/workflows/closure-checks.yml` should include a check:
```yaml
- name: Verify lane isolation in manifest
  run: |
    WORKSPACE=$(jq -r '.workspace_path // ""' .block-ready.agent1.json)
    IS_RO=$(jq -r '.is_read_only // true' .block-ready.agent1.json)
    CANONICAL=$(git rev-parse --show-toplevel)
    if [ "$IS_RO" = "false" ] && [ "$WORKSPACE" = "$CANONICAL" ]; then
      echo "FAIL: is_read_only=false but workspace_path is canonical clone."
      echo "Workers that commit must use a dedicated git worktree."
      exit 1
    fi
```

## Lesson Locked

2026-06-06: OBSERV Block 1 agent's addendum commit (536f1e9bc) landed on `docs/wave-1-settlement-spec` (wrong branch) because a concurrent agent switched HEAD in the shared canonical clone during the same `git commit` window. Both agents had `is_read_only: false` but shared one workspace. Recovery: drop stray commit, create `IH35-TMS-observ` worktree, resume in isolation.

## Standing Order

All future block dispatches that perform git operations MUST declare `workspace_path` pointing to a dedicated worktree. The parent coordinator creates the worktree before dispatching the block, or the block's preamble creates it and confirms isolation before any other git operation.
