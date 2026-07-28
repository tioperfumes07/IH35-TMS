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
- Refuses dirty trees and unresolved merge/rebase/cherry-pick conflicts.
- Refuses when branch is behind `origin/main`.
- Runs required chain in order:
  - backend build
  - frontend TypeScript build
  - static guard classification
  - `npm run block-ready` (includes C4/C5 verify chain; see C5 Dedupe section below)
- Database capability is **not** “`DATABASE_URL` is a non-empty string.” It is true only for an
  owned ephemeral VLCI lifecycle or a validated local-CI verify connection (see Pre-push protection).
- When no database capability is present, `block-ready` is skipped only with the named server-required
  equivalent `ci / build-typecheck`; all preceding local gates still run and fail closed.
- Pre-push must not shell-source `.env`; hook and direct precheck share parent-process env only.
- Halts on first failure and prints failing step plus output tail.
- Prints `READY TO PUSH: <branch> at <sha>` on success.

### Standing order — run `npm run verify:static` before EVERY push

CI's `build-typecheck` runs ~250 `scripts/verify-*.mjs` guards; a single stale string-anchored guard
tripping on a refactor reads as a "typecheck failure" and costs a full CI round-trip. **Before every push,
run `npm run verify:static` and fix any `FAIL-test(gated)` locally — never push into a red static guard.**

- It runs static guards with NO reachable database (a dead-port sentinel — it can never touch prod),
  classifying each `PASS` / `SKIP-capability` / `FAIL-test`.
- A local skip is permitted only by explicit capability preflight with a named server-required CI equivalent.
  Failure output text (including `DATABASE_URL`) never changes a real test failure into a skip.
- HOLD approval classification requires pull-request title and label metadata that does not exist before a
  branch's first push. Local `verify:static` therefore classifies `verify:hold-merge-gate` as
  `SKIP-capability pull-request-metadata` only after an authenticated live effective-rules query proves
  `main` requires `hold-merge-gate` from GitHub Actions integration `15368`, and the capability maps to the
  exact wired `hold-merge-gate / hold-merge-gate` context. Missing `gh`, missing authentication, offline/API
  failure, malformed output, timeout, wrong integration, or absent live rule hard-fails. GitHub runs the
  context with authoritative PR metadata and remains fail-closed: a protected PR without
  `JORGE-APPROVED` is red and cannot merge.
- PASS-8 is producer→consumer orchestration: local `verify:static` does not generate the ignored
  `PASS-8-PRE-PROD-SMOKE-RESULTS.*` report, so an absent report may skip only as the explicit
  `pass8-artifact` capability backed by the wired conditional CI context
  `pass-8-smoke-verify / pass-8`. PASS-8 is intentionally not a universal branch-protection requirement.
  Its CI job must run `verify:pass-8-smoke` before `verify:pass-8-clean-baseline`; producer failure blocks
  the consumer.
  Generated PASS-8 reports remain ignored and must never be committed.
- It exits non-zero **only** on a `FAIL-test(gated)` — a guard CI actually runs. `SKIP-capability` and `FAIL-test(unwired)`
  (orphan guards CI does not run) never fail the run; unwired FAILs are surfaced as informational.
- `node scripts/verify-static.mjs --selftest` self-checks the runner (incl. the sentinel-isolation lock).

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
- **Do NOT source repository `.env` in the husky pre-push hook.** The hook and a direct
  `npm run branch:precheck-push` must see the same process environment (Rule 18 /
  `CURSOR-PIPELINE-REPAIR-WORKORDER` P0-1). A stale `DATABASE_URL` string in `.env`
  (e.g. bad Neon password) is not a database capability and must not override the parent shell.
- **Database capability law:** capability is true only when a **real, authenticated `ih35_verify`
  Postgres** answers — supplied by an **owned ephemeral VLCI / local-CI lifecycle** (lock + token +
  bindings) **or** a **validated** local-verify connection (CI `:54329/ih35_verify`). In BOTH cases
  a live **authenticated `pg` identity probe** must connect on a loopback host and assert
  `current_database() = 'ih35_verify'` (a database name that never exists in production, where
  `current_database()` is `neondb`). A bare TCP acceptor (no pg handshake), the wrong database,
  wrong credentials, or any non-local / production URL all return **false** — the probe never opens
  a socket to a non-loopback endpoint. Mere URL-string presence never authorizes, and a lock that
  claims ownership of a database that is not actually live/`ih35_verify` fails closed. When
  capability is absent, `block-ready` skips only via the named server-required equivalent
  `ci / build-typecheck` (fail-closed policy). No `HUSKY=0` / `--no-verify` bypass.
- **Closed all-gates bypass (Rule 18 P0-1):** the production CLI ignores `BRANCH_PRECHECK_STEPS_JSON`
  and `IH35_BRANCH_TOOLING_SKIP_FETCH`. Gate steps come only from the built-in chain (or a direct
  test function option), and the freshness `git fetch origin` always runs. No user-settable
  environment variable can empty the step list or skip the fetch. `BRANCH_PRECHECK_STEPS_JSON=[]` +
  `IH35_BRANCH_TOOLING_SKIP_FETCH=1` no longer reports `READY TO PUSH` with zero substantive checks.
- Regression lock: `scripts/verify-pre-push-env-isolation.mjs` (+ verify-steps/926) and
  behavioral tests in `scripts/__tests__/branch-precheck-push.test.mjs` (planted fake-TCP,
  wrong-`current_database`, wrong-credentials, and env-bypass cases), run unconditionally by CI.

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

### Orchestrators must never run inside C5 (locked 2026-07-19)

`block_ready_c5_skip_orchestrators` lists gate **orchestrators** that must not be treated as C5 unit guards:

- `verify:local-ci` — owns an ephemeral Postgres + full `verify:pre-commit` (single-owner; dynamic port; nested ACTIVE fails closed)
- `verify:static` — already run by `branch:precheck-push` before `block-ready`

C5 logs: `[C5] SKIP <name> (orchestrator — single-owner outside C5)`.

Regression lock: `scripts/verify-local-ci-gate-acyclic.mjs` (+ verify-steps/910) + `scripts/__tests__/verify-local-ci-lifecycle.test.mjs`.

### How to add a script to the skip list

1. Ensure the script runs in C4 (or another check before C5) so skipping C5 does not drop coverage.
2. Add the `verify:*` name to `block_ready_c5_skip_after_c4` in `scripts/verify-meta.json`.
3. Extend `scripts/verify-block-ready-c5-no-duplicate-arch-design.mjs` if the guard should assert the new name.
4. Add a test in `scripts/__tests__/block-ready.test.mjs` for `shouldSkipC5VerifyScript`.
5. Orchestrators go in `block_ready_c5_skip_orchestrators`, never in the C5 unit-guard loop.

### Pre-push hook (slim)

`npm run branch:precheck-push` now runs in order:

1. `npm run build:backend`
2. `cd apps/frontend && npx tsc -b`
3. `npm run block-ready` (runs `verify:static` **once** via unforgeable in-process proof — `scripts/static-sweep-proof.mjs`)

No per-script `verify:*` loop before `block-ready`, and C5 must not nest `verify:local-ci` / re-run `verify:static`. Pre-push must **not** duplicate `verify:static` when `block-ready` runs; if `block-ready` is capability-skipped, precheck runs a one-shot `verify-static-fallback`. Direct `npm run block-ready` always ensures static once (or fail closed). After Block 10 merges, feature pushes can use normal `git push` (no `--no-verify`) when local `block-ready` completes within the IDE window.

### VLCI ownership (locked 2026-07-19 adversarial)

`IH35_VLCI_OWNED` / `INHERIT` / `ACTIVE` **never authorize alone**. Ownership is the canonical temp lock + per-run token + live owner pid/start + exact `dataDir`/`port`/`database`/`url` bindings. Arbitrary `IH35_VLCI_LOCK_PATH` and unbound `localhost` `ih35_verify` URLs are rejected. `verify:db:reset` requires that proof for non-`:54329` targets.

### Measured baseline

| Milestone | `block-ready` wall time |
| --- | --- |
| Block 9 (before C5 dedupe) | 702s |
| Block 10 (target after C5 dedupe + pre-push slim) | ~487s |

---

## §N. Branch freshness is measured by OVERLAP, not by distance (permanent — 2026-07-28)

**The rule:** a PR whose base is behind `origin/main` is FINE. It is stale — and must rebase — only if
main changed a file this branch also changes, or if both touch a **globally-allocated** path.

**Why this changed.** `verify:branch-fresh` previously failed whenever the base was *any* commits behind
main. That is a hard serialization: every merge invalidates every other open PR, so N open PRs cost on the
order of N² full CI rebuilds at ~20–40 minutes each. A single PR routinely took hours to land through no
fault of its own, and the entire cost bought nothing — the vast majority of those rebases were between PRs
that touched completely unrelated files. GitHub's own ruleset already sets
`strict_required_status_checks_policy: false`; the zero-behind requirement was ours alone.

**What the gate is actually for** is catching a branch that is stale *in a way that matters*: CI validated a
combination of changes that will never exist once the branch merges. Distance from main is a proxy for that,
and a poor one — it punishes every unrelated PR equally while catching nothing extra.

**Globally-allocated paths** still force a rebase even with no file overlap, because there the collision is
in a shared *number space* rather than a shared file:

| Path | Why any concurrent change collides |
|---|---|
| `db/migrations/` | migration numbers are globally ordered; two lanes can pick the same one |
| `scripts/verify-steps/` | verify-step numbers are globally allocated |
| `package-lock.json` | lockfile resolution is global |

Both real collisions on 2026-07-28 were exactly this shape — a duplicate migration number
(`202610060000` claimed by two lanes) and a duplicate verify-step number (`1665`). Neither would be caught
by a same-file check, which is why the coupled-path list exists and must not be dropped.

**Enforcement:** `scripts/verify-branch-fresh.mjs`, proven by `scripts/verify-branch-fresh-selftest.mjs`
(verify-step `1681`), which builds REAL throwaway git repositories and asserts all four cases: behind with no
overlap passes; same-file, same-migration-dir and same-verify-step-dir each fail. Set `BRANCH_FRESH_MAX=0`
plus an overlapping change to reproduce the old behaviour.

**Do not "fix" a red branch-fresh by widening this rule.** If it fires, main genuinely moved underneath you
in a way that matters — rebase.
