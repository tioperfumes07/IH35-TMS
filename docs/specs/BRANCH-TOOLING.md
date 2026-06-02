# Branch Tooling Reference

This project standardizes branch operations through six scripts plus a pre-push guard. Use these commands instead of ad-hoc git recovery steps.

## 1) Rebuild a branch linearly

Command:

`npm run branch:rebuild-linear -- --source <sha1> [--source <sha2> ...] [--branch <name>] [--message "commit message"]`

Behavior:

- Refuses on dirty trees and refuses to run on `main`.
- Fetches `origin/main`, hard-resets to it, and reapplies each source commit diff with `git apply --3way`.
- Stops on conflicts, prints conflicted files, and supports rerun after manual resolution via `--resume`.
- Commits rebuilt changes and prints original/new tip plus changed-file count.
- Never pushes automatically.

Typical recovery flow:

1. Copy source SHAs from reflog or local history.
2. Run `branch:rebuild-linear`.
3. Resolve conflicts if needed.
4. Run `npm run branch:precheck-push`.
5. Push with `git push --force-with-lease`.

## 2) Pre-push verification gate

Command:

`npm run branch:precheck-push`

Behavior:

- Refuses outside feature-style branches.
- Refuses when branch is behind `origin/main`.
- Runs required chain in order:
  - backend build
  - frontend TypeScript build
  - `npm run block-ready` (includes C4/C5 verify chain; see C5 Dedupe section below)
- Halts on first failure and prints failing step plus output tail.
- Prints `READY TO PUSH: <branch> at <sha>` on success.

## 3) Safe branch switching

Command:

`npm run branch:safe-switch -- <target-branch>`

Behavior:

- Refuses on dirty trees and in-progress merge/rebase/cherry-pick operations.
- Refuses if there were more than 3 branch checkouts in the last 30 minutes.
- Fetches remotes and warns if target is more than 100 commits behind `origin/main`.
- Checks out target and prints previous branch plus how far `origin/main` is ahead.

## 4) Stale branch cleanup

Command:

`npm run branch:cleanup-stale [--dry-run] [--force]`

Behavior:

- Fetches with prune.
- Finds local branches that have no unique commits versus `origin/main`.
- Excludes `main`, the current branch, and `wip/*` / `tmp/*` branches newer than 7 days.
- `--dry-run` prints what would be deleted.
- Without `--force`, asks for confirmation before deletion.
- Prints deletion/retention summary at the end.

## 5) Sync state snapshot

Command:

`npm run sync`

Behavior:

- Fetches `origin`.
- Prints a single status report with branch/head/dirty state.
- Summarizes branch vs `origin/main`, open PR signal, env readiness, and block context.
- Uses `gh` when present; otherwise falls back to GitHub REST with `GITHUB_TOKEN`.

## 6) Block ship orchestrator

Command:

`npm run block:ship -- "<commit message>"`

Behavior:

- Runs `sync` first and applies decision logic.
- Refuses on non-feature branch.
- Refuses when behind `origin/main` and suggests `branch:rebuild-linear`.
- Commits dirty working trees with the provided message.
- Runs `branch:precheck-push` and then pushes with `--force-with-lease` on success.

## Hooks and installation

- `npm run prepare` installs husky hooks and writes `.husky/pre-push`.
- `.husky/pre-push` runs `npm run branch:precheck-push`.
- Manual install path remains available through:

`node scripts/install-git-hooks.mjs`
# Branch Tooling (P7-INFRA-BRANCH-TOOLING)

One-page reference for safe branch operations in IH35-TMS.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run branch:rebuild-linear -- --source <sha> [--source <sha> ...] [--message "..."]` | Rebuild current feature branch as one linear commit on top of `origin/main` |
| `npm run branch:precheck-push` | Run build + verify chain + `block-ready` before push |
| `npm run branch:safe-switch -- <branch>` | Switch branches with dirty/merge/reflog guardrails |
| `npm run branch:cleanup-stale [--dry-run] [--force]` | Delete local branches with no unique work vs `origin/main` |
| `npm run sync` | One-command status snapshot (git + GitHub + Render + env) |
| `npm run block:ship -- "<message>"` | Orchestrate commit/verify/push with branch-aware guards |

## Recover a conflicted PR in one command

1. Identify source commit(s) with the desired work.
2. Checkout your feature branch.
3. Run:

```bash
npm run branch:rebuild-linear -- --source <sha1> [--source <sha2>] --message "feat: linearized safety events"
```

4. If conflicts are reported, resolve files, then rerun with `--resume`.
5. Run `npm run branch:precheck-push`.
6. Push with lease:

```bash
git push --force-with-lease origin <feature-branch>
```

## Pre-push protection

- Hook file: `.husky/pre-push`
- Installer: `npm run prepare` (husky) or `node scripts/install-git-hooks.mjs`
- On `git push`, `branch:precheck-push` runs automatically and blocks unsafe pushes.

## Safety rules enforced

- Refuse dirty trees for rebuild/switch.
- Refuse rebuild on `main`.
- Refuse push precheck when branch is behind `origin/main`.
- Refuse switch during merge/rebase/cherry-pick.
- Refuse excessive checkout churn in reflog (30-minute window).
- Never auto-push from rebuild script.

## C5 Dedupe + Pre-Push Slim (locked 2026-06-01)

### Why this exists

`block-ready` C4 runs `npm run verify:arch-design` (~215s). C5 used to re-run every `verify:*` script including `verify:arch-design` again. The husky pre-push hook (`branch:precheck-push`) also looped all non–db-gated `verify:*` scripts before `block-ready`, tripling work on every push. Cursor IDE agent shells often timed out around 600–700s on that stack.

Block 9 measured full `block-ready` at **702s**. Block 10 removes the duplicate arch-design pass in C5 and drops the pre-push verify loop so push precheck is build + `block-ready` only. Target after Block 10: **~487s** per `block-ready` run (~215s saved).

### How `block_ready_c5_skip_after_c4` works

`scripts/verify-meta.json` lists script names C4 already executed. In C5, `block-ready.mjs` skips those with:

`[C5] SKIP <name> (already run in C4)`

Today the list is only `verify:arch-design` (C4 runs it explicitly).

### How to add a script to the skip list

1. Ensure the script runs in C4 (or another check before C5) so skipping C5 does not drop coverage.
2. Add the `verify:*` name to `block_ready_c5_skip_after_c4` in `scripts/verify-meta.json`.
3. Extend `scripts/verify-block-ready-c5-no-duplicate-arch-design.mjs` if the guard should assert the new name.
4. Add a test in `scripts/__tests__/block-ready.test.mjs` for `shouldSkipC5VerifyScript`.

### Pre-push hook (slim)

`npm run branch:precheck-push` now runs in order:

1. `npm run build:backend`
2. `cd apps/frontend && npx tsc -b`
3. `npm run block-ready`

No per-script `verify:*` loop before `block-ready`. After Block 10 merges, feature pushes can use normal `git push` (no `--no-verify`) when local `block-ready` completes within the IDE window.

### Measured baseline

| Milestone | `block-ready` wall time |
| --- | --- |
| Block 9 (before C5 dedupe) | 702s |
| Block 10 (target after C5 dedupe + pre-push slim) | ~487s |
