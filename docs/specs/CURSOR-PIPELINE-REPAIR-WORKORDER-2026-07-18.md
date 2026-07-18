# Cursor Pipeline Repair Work Order — 2026-07-18

**Status:** Owner-directed, docs-only governance record.
**Goal:** Restore trustworthy verification and return small non-financial PRs to an evidence-backed 8–12 minute push-to-ready target without weakening financial, RLS, migration, security, audit, or design controls.

## Verified facts

1. `scripts/verify-steps/_context.mjs` returned `result.status ?? 1`; `scripts/verify-steps/_runner.mjs` only awaited the step and ignored resolved numeric failure.
2. Planted proof on the pre-commit runner returned `7`, printed the next line, and exited `0`.
3. Real wrappers used return-based failure, including the no-guard-hotfile-thrash and XLSX closeout steps.
4. `.husky/pre-push` shell-sourced repository `.env`. A normal feature branch reported `READY TO PUSH` with `BRANCH_PRECHECK_STEPS_JSON=[]` and `IH35_BRANCH_TOOLING_SKIP_FETCH=1`, running zero substantive checks.
5. Manifest resolution selected `.block-ready/ACCT-INTEGRITY-VERIFY-EXTEND.json` while the active branch was `fix/xlsx-cve-closeout`.
6. `branch-precheck-push.mjs` blocked every branch with `behind > 0`, even without a text conflict.
7. The active GitHub Ruleset is `17935054`: four required checks, `strict_required_status_checks_policy=false`, no bypass actors. Classic branch protection is absent; the repository is not unprotected.
8. `build-typecheck` takes roughly 10–11 minutes. About 4m42s is `verify:pre-commit`; roughly another five minutes repeats manually listed guards/tests/builds.
9. One-commit PR median was 18.9 minutes; multi-commit PR median was 177.9 minutes. Corrective scope expansion consumed most observed delay.

## Acceptance law

- Newly exposed red guards are defects to triage and fix with evidence.
- Never weaken, skip, allowlist, or revert the truthful runner to make the board green.
- Intentional command probes must use an explicit non-throwing API and carry focused tests.
- Local-only edits, status lines, and unpushed commits are not shipped evidence.
- Every repair is one bounded PR, independently reviewed. Financial/schema/RLS/migration work remains owner-gated.

## P0 sequence — one isolated serialized infrastructure lane

### P0-1 — Close environment and manifest bypasses

- Remove repository `.env` shell-sourcing from Git hooks.
- Test-only step injection/fetch skipping must be inaccessible in normal execution.
- Require exactly one manifest whose declared branch, block identity, base SHA, allowed scope, and risk classification match the active branch and full working state.
- Derive DB, guard, financial, migration, security, and runtime requirements from the diff; a manifest may strengthen but never weaken them.
- Plant empty-step, skip-fetch, wrong-branch, missing, duplicate, stale, staged, renamed, and path-escape failures.

### P0-2 — Truthful fail-closed runner

Before changing behavior:

1. Inventory every verify-step that returns or ignores command status.
2. Execute return-based steps in isolation on current `main`.
3. Publish the expected exposed-red set with an owner and cause for every red.

Then:

- `ctx.run()` throws a typed error on nonzero, signal, null status, or spawn failure.
- Add explicit `ctx.runStatus()` only for intentional probes.
- The runner rejects nonzero numeric returns and propagates throws/rejections.
- Preserve caller `cwd`, `stdio`, and environment options.
- Replace step-level `process.exit()` where needed so orchestration cleanup remains reliable.

Behavioral planted tests must prove the suite fails for:

- returned nonzero;
- bare failing `ctx.run()`;
- thrown error;
- rejected promise;
- child signal/spawn failure;
- explicit `process.exit(1)` compatibility path.

The runner and every pre-enumerated exposed red land together honestly green. A red `main` is forbidden.

### P0-3 — Prove execution parity, then de-duplicate CI

- Build the exact guard/test/build inventory before and after.
- Remove an explicit `ci.yml` command only after its discovered wrapper is proven to execute the same control and propagate failure.
- Keep one stable always-reporting `build-typecheck` aggregator.
- Preserve unique checks, builds, coverage, DB validation, boot smoke, and financial/security controls.
- Add a guard that rejects duplicate CI execution without treating text presence as execution proof.
- Measure a real trivial PR before/after; target approximately 6–8 minutes CI without weakening coverage.

### P0-4 — Governance and scope integrity

- A PR mixing `apps/**` with `.cursor/rules/**`, `.claude/skills/**`, `AGENTS.md`, or the operating constitution fails.
- Law changes use a tiny owner-reviewed governance-only PR.
- Architecture and blueprint files may accompany the exact feature when project law requires same-commit tab/spec updates.
- Enforce one domain/lane and frozen scope. Cross-domain work requires a reviewed exception, not a raw file-count bypass.
- Split and replay mixed #2688, #2689, and #2690; do not append patches.

### P0-5 — Merge-group workflows and owner Ruleset

- Every required workflow must support `pull_request`, `merge_group`, and `push: main`.
- Required contexts always report. Use actual GitHub job contexts, never package-script names.
- Run exhaustive combined-main verification on `merge_group`.
- Keep one-item groups because every main merge deploys production.
- Cursor drafts the exact Ruleset PATCH and Settings instructions; Jorge alone applies it.
- After live queue proof, retire the blanket local zero-behind blocker. Until then, rebase only the next serialized merge candidate once.

## Parallel follow-through after P0

### Shared registry conflict removal

- Generate or shard `scripts/sql-write-targets-known-debt.json` into per-finding inputs.
- Keep `docs/schema-parity-baseline.json` deterministic; any further migration-adjacent sharding/regeneration is owner-gated.
- Never use union merge semantics for ratchet debt because removed debt can be resurrected.

### Shared DB isolation

- Give tests unique company/user/fixture identities and transaction-safe cleanup.
- Prohibit rerun-until-green.
- Serialize only the DB-test shard until repeated randomized runs prove isolation.

### CI architecture

- Continue dependency-aware guard metadata, deterministic DAG selection, build-once artifacts, and shard isolation in the infrastructure lane.
- Keep product lanes moving on disjoint scopes after P0 trust controls land.

## Rerere

Optional operator convenience only:

```text
rerere.enabled=true
rerere.autoupdate=false
```

It must not be installed through `npm prepare`, auto-stage resolutions, or substitute for review, disjoint ownership, deterministic files, or Merge Queue.

## Definition of done

- Runner planted failures all turn red and cannot regress.
- No environment variable or stale manifest can suppress a real gate.
- Guard-set parity is equal or stronger after CI de-duplication.
- A trivial non-financial PR reaches green/ready in the measured target band.
- Two disjoint PRs pass through one-item Merge Queue without manual rebase after admission.
- No rerun is used to cure shared-DB flakiness.
- Every PR is committed, pushed, independently reviewed, and verified on shared evidence; merge/deploy proof follows project risk law.
