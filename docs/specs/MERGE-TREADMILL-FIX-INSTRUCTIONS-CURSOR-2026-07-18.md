# Merge Treadmill — LOCKED Fix Sequence (2026-07-18)

> **Status: evidence-backed and LOCKED (Jorge, 2026-07-18).** Reconciles GUARD (Claude Coder),
> Claude Agent, and Cursor after a 3-lane adversarial round. Every fact below was verified live on
> disk this session. Owner (Jorge) authorized the fixes; Cursor Coder implements. All items are
> **non-financial CI/tooling** (no `accounting.*`/`catalogs.*`/`mdata.*`, no `db/migrations/*`, no
> money) → buildable and self-mergeable on green per §1.2, EXCEPT where marked owner-gated.
> Root-cause detail: `MERGE-TREADMILL-PLAN-2026-07-18.md`.

## ★ ACCEPTANCE RULE (Jorge, non-negotiable)
**Newly exposed red guards are defects to TRIAGE and FIX with evidence — never a reason to weaken,
skip, or revert the runner.** When step 2 makes the runner honest, guards that were silently failing
will turn red. Each red is classified (real defect vs. a guard that was itself wrong) and **fixed with
live proof**. Reverting the runner to restore green is a §10 fake-green violation and is forbidden.

## Verified facts (all lanes agree)
- **Zero-behind pre-push gate = the rebase mandate.** `branch-precheck-push.mjs` FAILs on `behind > 0`
  vs `origin/main`, any file, no conflict → every push forced to rebase. Live-reproduced.
- **The gate is also bypassable.** `.husky/pre-push` shell-sources `.env`; `BRANCH_PRECHECK_STEPS_JSON=[]`
  (empties the step list) and `IH35_BRANCH_TOOLING_SKIP_FETCH=1` (skips the fetch) silently disable it.
- **The CI runner is FALSE-GREEN for return-based steps.** `_runner.mjs` does `await run()` and ignores
  the resolved value; `_context.mjs:16` `run()` returns `result.status ?? 1` (numeric, no throw). Steps
  that `return 1` (e.g. `143`, `144`) are **swallowed** — suite exits 0. Steps that `process.exit(1)`
  fail-closed. Contract is inconsistent (~103/194 steps are return-based candidates).
- **`main` IS protected** (Ruleset 17935054, 4 checks, `strict:false`) — server does not force rebases;
  the local hook does. Merge-queue check contexts must be **real job names** (`verify:sql-column-existence`
  is not a check context).

---

## LOCKED SEQUENCE

### 1 — Close the `.env` / skip-variable bypass  *(non-financial)*
Make the pre-push gate un-disableable by a developer `.env`. In `branch-precheck-push.mjs`:
- **Ignore `BRANCH_PRECHECK_STEPS_JSON` and `IH35_BRANCH_TOOLING_SKIP_FETCH` unless a trusted CI context**
  is present (e.g. `process.env.CI === "true"` AND a signed/known context) — never from `.env`.
- Prefer: stop `.husky/pre-push` from `set -a`-sourcing arbitrary `.env` keys into the gate's env; load
  only the specific vars the checks need (e.g. `DATABASE_URL`), not the whole file.
- **Guard:** `scripts/verify-precheck-not-bypassable.mjs` + `verify-steps/NNN-*.mjs` — asserts a planted
  `.env` with those vars does NOT reduce the executed step set. Report the executed-steps proof.

### 2 — ★ KEYSTONE: make the runner honest  *(non-financial, high-blast — expect exposed reds)*
- `_runner.mjs`: capture and honor the result — `const rc = await run(); if (rc !== 0 && rc !== undefined)
  { throw / process.exit(1) }`. Normalize: a step signals failure by non-zero return OR throw OR exit —
  all must fail the suite.
- `_context.mjs`: keep numeric returns, but the runner must act on them (above). Optionally make `run()`
  variants explicit (`runOrThrow` vs `runStatus`) so intent is unambiguous.

- **2a — PRE-ENUMERATE THE WAVE BEFORE touching the runner (do this FIRST, read-only).** Run each
  return-based verify-step in isolation on current `main` and record which already return non-zero. That
  precomputed list IS the exact set of reds step 2 will expose — nothing more should appear. Publish it as
  `docs/trackers/RUNNER-EXPOSED-REDS-2026-07-18.md` with an owner + classification per red. Now step 2 is a
  KNOWN quantity, not a surprise: after the fix, the reds must match this list exactly; any red NOT on it
  means the fix broke something and gets investigated, any listed red still green means the fix missed a path.

- **2b — Plant the proof guard, testing BEHAVIOR not implementation:** `scripts/verify-runner-fails-closed.mjs`
  + `verify-steps/NNN-*.mjs`. It must assert `verify:pre-commit` exits non-zero for a synthetic step that
  fails via EACH of the three signals — `return 7`, `throw`, and `process.exit(1)` — so a future refactor
  can't fix one path and silently re-break another. This is the §2 regression guard; the runner can never
  slip back to fail-open.

- **2c — KEEP `main` GREEN: triage the whole wave on ONE branch/stack; merge only when green.** Because
  merge = prod deploy AND a red `main` blocks every other lane's merges, do NOT merge a runner fix that reds
  `main`. Fix the runner + fix (or explicitly, evidence-backed, defer via tracker) every red on the 2a list
  in the same branch/stack, and merge only once the suite is honestly green. A red `main` while triaging
  would halt the whole team.

- **Triage per the ACCEPTANCE RULE:** every newly-red guard is a DEFECT classified + fixed with evidence.
  Do NOT de-dup, weaken, allowlist, or revert to regain green. **A wave of reds after step 2 is SUCCESS —
  the fake-green surfacing — not a regression.** The board looks worse for a moment before it is true.

### 3 — Inventory every `ci.yml` duplicate + prove propagation  *(non-financial)*
For each `run: npm run verify:X` after the `verify:pre-commit` step: confirm a `verify-steps/*` runs it
AND (post-step-2) that its step propagates failure. Produce the inventory table (X → covering step →
propagates? y/n). No removal yet.

### 4 — De-duplicate CI  *(non-financial)*
Remove only the `ci.yml` `verify:X` lines proven covered AND fail-closed in the suite (from step 3).
Uncovered/unproven → leave, or add a proper verify-step first. **Guard:**
`scripts/verify-no-ci-guard-duplication.mjs`. Acceptance: `build-typecheck` drops to the ~6–8 min band;
executed guard-name set is superset-or-equal to before.

### 5 — Small single-domain PRs + governance gate  *(gate is owner-reviewed)*
- Rebuild #2688/#2689/#2690 as small, one-module-lane, frozen-scope PRs. Infra merges alone.
- **Governance gate:** `apps/**` + `SKILL.md`/constitution/rules in one PR = hard fail. Architecture-design
  docs MAY ride with the feature requiring the same-commit update. Law edits → tiny owner-reviewed PR.
- **PR-scope gate:** by module-lane spread + frozen scope + reviewed exception — NOT a raw file-count cap.

### 6 — Merge Queue  *(owner applies the Ruleset)*
Add `merge_group` workflow triggers; Jorge enables a one-item Merge Queue and the revised Ruleset using
**real job-name check contexts only**. The queue rebases+tests the combined result against latest `main`
— the correct freshness validation.

### 7 — Retire the blanket zero-behind gate  *(after step 6 proves combined-main validation)*
Only once the queue validates combined-main: remove/relax `branch-precheck-push.mjs`'s `behind > 0` block.
Do NOT relax it before the queue exists — file-overlap detection cannot catch semantic staleness
(changed import signatures, schemas, generated artifacts in other files), so an early relax can merge a
green-but-broken branch.

### 8 — Registry sharding + DB-fixture isolation  *(infra lane; schema-parity is owner-gated)*
- `sql-write-targets-known-debt.json` / `schema-parity-baseline.json`: generate from the ratchet or shard
  into per-finding/per-migration fragments. **Never json-union** (union resurrects removed debt).
  `schema-parity-baseline.json` is migration-adjacent → **owner OK before merge.**
- Flaky financial `*.db.test.ts`: per-test company/user fixture; remove rerun-until-green (fake-green).

---

## Rules for these PRs (so they don't re-create the treadmill)
- One fix = one small, single-lane PR. Do NOT bundle.
- Register guards via `scripts/verify-steps/NNN-*.mjs` ONLY — never edit `package.json` verify keys /
  `locked-guards.yml` / `ci.yml` guard-runs (except step 4, which REMOVES duplicates from `ci.yml`).
- Do not touch financial/migration paths in any of these PRs.

## Report back with EVIDENCE (§0 — no "done" without live proof)
Per step: PR#, guard added, and a live measurement — step 1: planted `.env` did not shrink the step set;
step 2: the `return 7` step now fails the suite + the list of newly-red guards triaged; step 4:
before/after `build-typecheck` minutes + guard-set diff. CI-green is the floor, not "done."
