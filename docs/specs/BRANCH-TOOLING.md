# Branch Tooling Reference

This project standardizes branch operations through four scripts plus a pre-push guard. Use these commands instead of ad-hoc git recovery steps.

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
  - clean backend dist
  - backend build
  - frontend TypeScript build
  - every `verify:*` package script (auto-discovered)
  - `npm run block-ready`
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
