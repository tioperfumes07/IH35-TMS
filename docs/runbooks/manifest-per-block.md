# Per-Block Manifest Pattern

## Summary

Each block (PR / work unit) writes its own manifest to `.block-ready/<block-id>.json`
instead of editing the shared `.block-ready.agent1.json` file. This eliminates
manifest merge conflicts in parallel lanes.

---

## Why This Matters

The old pattern had a single `.block-ready.agent1.json` file shared across all agent-1
work. Two parallel PRs both editing that file produced a merge conflict every time.
With per-block manifests, each PR touches only its own isolated file. Zero conflicts.

---

## New Pattern

### File location

```
.block-ready/<BLOCK-ID>.json
```

### Example

```json
{
  "block_id": "GAP-99-MY-FEATURE",
  "branch": "feat/gap-99-my-feature",
  "phase": "GAP-HIGH",
  "task": "Short description of what this block does",
  "agent": "1",
  "allowed_files": [
    ".block-ready/GAP-99-MY-FEATURE.json",
    "apps/backend/src/...",
    "apps/frontend/src/..."
  ],
  "extra_gates": [],
  "runtime_path": "src",
  "db_required": false,
  "guard_required": false
}
```

### Step-by-step

1. **Create your manifest first** (before any other file changes):
   ```
   .block-ready/<YOUR-BLOCK-ID>.json
   ```
2. Add this path to `allowed_files` in the manifest itself.
3. Include it in the PR — `scripts/block-ready.mjs` will auto-detect it.
4. Run `npm run block-ready` — it resolves your manifest from `.block-ready/`.

---

## Auto-Resolution Logic

`scripts/block-ready-agent-manifest.mjs → resolveBlockReadyManifest()` uses this
priority order to find the manifest:

| Priority | Condition | Result |
|----------|-----------|--------|
| 1 | `BLOCK_ID` env var set | `.block-ready/$BLOCK_ID.json` |
| 2 | Legacy `.block-ready.agentN.json` exists and has `block_id` field | `.block-ready/<block_id>.json` if that file exists |
| 3 | Exactly one `.json` in `.block-ready/` | That file |
| 4 | Fallback | `.block-ready.agent1.json` (legacy) |

You can always override with `--manifest` flag:
```
npm run block-ready -- --manifest .block-ready/MY-BLOCK-ID.json
```

---

## Aggregation

`aggregateBlockReadyManifests()` (exported from `block-ready-agent-manifest.mjs`)
reads **all** `.block-ready/*.json` files. Use this for audit tooling, dashboards,
or any script that needs a full view of all known blocks.

```js
import { aggregateBlockReadyManifests } from "./scripts/block-ready-agent-manifest.mjs";

const allBlocks = aggregateBlockReadyManifests();
// Returns: [{ block_id: "...", ... }, ...]
```

---

## Legacy Files: Frozen

The following files are **frozen** — no new direct edits allowed:

- `.block-ready.agent1.json`
- `.block-ready.agent2.json`
- `.block-ready.json`

The `manifest-split-guard.yml` CI workflow enforces this. Any PR that directly
modifies these files will fail CI.

The content of these files is preserved for reference and historical consistency.
The per-block manifests in `.block-ready/` are the source of truth going forward.

---

## C9 Scope Check

The `block-ready.mjs` C9 check validates that all changed files are listed in the
**current block's** `allowed_files`. The current block manifest is resolved via the
priority table above — only that one manifest's `allowed_files` is checked, not
the aggregate of all blocks.

---

## Migration Guide (for existing branches)

If you have an open branch that edits `.block-ready.agent1.json`:

1. Create `.block-ready/<YOUR-BLOCK-ID>.json` with the same content
2. Add `.block-ready/<YOUR-BLOCK-ID>.json` to `allowed_files` in that new file
3. Remove `.block-ready.agent1.json` from `allowed_files` (or keep it for backwards-compat during transition)
4. The CI guard only blocks **new direct edits** to the legacy file, not historical references in `allowed_files`
