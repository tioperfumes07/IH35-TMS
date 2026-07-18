# Cursor Coder — Merge Treadmill FIX Instructions (2026-07-18)

> Owner (Jorge) authorized these fixes. Goal: **stop the forced-rebase-on-every-push, cut CI to
> ~6–8 min, get branches green-and-mergeable fast with the fewest conflicts/failures possible.**
> All items below are **non-financial CI/tooling** (no `accounting.*`/`catalogs.*`/`mdata.*`, no
> `db/migrations/*`, no money) → buildable and self-mergeable on green per §1.2. Do NOT touch
> financial/migration paths in these PRs. Full root cause: `MERGE-TREADMILL-PLAN-2026-07-18.md`.
> Verify the plan branch first: `git show fda607e1e`.

**Ground rules for these PRs (so they don't re-create the treadmill):**
- One fix = one small, single-lane PR. Do NOT bundle these together.
- Do NOT edit `package.json` verify keys, `locked-guards.yml`, `ci.yml` guard-runs (except FIX 1
  which edits `ci.yml` to REMOVE duplicates), `SKILL.md`, or the blueprint in these PRs.
- Every fix ships with a `scripts/verify-*.mjs` guard wired via `scripts/verify-steps/NNN-*.mjs`
  ONLY (no `package.json`/workflow edits), per STOP-THE-THRASH FIX-1.

---

## ★ FIX 0 — Make the pre-push freshness gate conflict/risk-aware (THE root cause)

**File:** `scripts/branch-precheck-push.mjs` (currently FAILs on `behind > 0` — any file, no conflict).

**Problem:** lines ~66-70 do `if (behind > 0) FAIL "run npm run branch:rebuild-linear"`. Because
`main` merges ~13×/day, every branch is behind within minutes → **every push forced to rebase even
with zero conflict.** Live-reproduced on a 2-cold-file docs branch.

**Change:** keep the safety intent (don't merge stale against high-risk surfaces) but only block when
there is REAL risk. Replace the blanket `behind > 0` block with:

```js
const behind = behindOriginMainCount(root);
if (behind > 0) {
  const mergeBase = runGitOrThrow(["merge-base", "HEAD", "origin/main"], { cwd: root });
  const branchFiles = new Set(
    runGitOrThrow(["diff", "--name-only", `${mergeBase}..HEAD`], { cwd: root }).split("\n").filter(Boolean)
  );
  const mainFiles = runGitOrThrow(["diff", "--name-only", `${mergeBase}..origin/main`], { cwd: root })
    .split("\n").filter(Boolean);

  // (a) real text-conflict risk: main advanced a file THIS branch also changed
  const overlap = mainFiles.filter((f) => branchFiles.has(f));
  // (b) high-blast-radius integration files (reuse the SAME list as verify-branch-fresh.mjs)
  const touchesHighBlast = mainFiles.some((f) => HIGH_BLAST_PATHS.includes(f));

  if (overlap.length > 0 || touchesHighBlast) {
    return { ok: false, reason:
      `behind ${behind} and origin/main advanced files this branch depends on ` +
      `(${[...overlap, ...mainFiles.filter(f=>HIGH_BLAST_PATHS.includes(f))].slice(0,5).join(", ")}) — ` +
      `run npm run branch:rebuild-linear` };
  }
  console.warn(`[branch:precheck-push] WARN: ${behind} behind origin/main but no overlap/high-blast — allowing push.`);
}
```

- **`HIGH_BLAST_PATHS` must be the SINGLE shared list** — export `ALLOWLIST_PATHS` from
  `verify-branch-fresh.mjs` (or move to `scripts/lib/`) and import it in BOTH files. Do not copy-paste.
- Keep `GITHUB_BASE_SHA = merge-base` line intact.
- **Escape hatch env:** honor `BRANCH_PRECHECK_STRICT=1` to restore old `behind>0` behavior if ever needed.

**Guard (required):** `scripts/verify-precheck-push-conflict-aware.mjs` + `verify-steps/NNN-*.mjs`
self-test asserting: (1) behind-with-no-overlap-and-no-highblast → PASS/warn, (2) behind-with-overlap
→ FAIL, (3) behind-with-highblast-file → FAIL. Use temp git fixtures or mock `runGitOrThrow`.

**Acceptance:** a branch 1+ commits behind `origin/main` that changed only non-overlapping,
non-high-blast files **pushes without rebasing**. A branch whose changed files were advanced on main,
or where main touched a high-blast file, still blocks.

---

## FIX 1 — De-duplicate CI (cut build-typecheck ~11 → ~6 min)

**File:** `.github/workflows/ci.yml`. It runs `verify:pre-commit` (the full ~156 `verify-steps/*`
suite) at ~line 71/75, THEN re-runs dozens of individual `run: npm run verify:*` steps that are
ALREADY inside that suite.

**Change (per-line, NO blanket delete):** for each `run: npm run verify:X` AFTER the `verify:pre-commit`
step, check whether a `scripts/verify-steps/*.mjs` already invokes `verify:X` (or `scripts/verify-X.mjs`):
```bash
# X = the verify name after "verify:"
grep -rl "verify-X\|verify:X" scripts/verify-steps/
```
- **Covered** (a verify-steps file runs it) → **remove that redundant `ci.yml` step.**
- **NOT covered** → leave it, OR (preferred, matches FIX-1) add `scripts/verify-steps/NNN-verify-X.mjs`
  and then remove the `ci.yml` line, so the suite owns it.
- Do not remove `verify:pre-commit`, `verify:branch-fresh`, build, tsc, or db steps.

**Guard (required):** `scripts/verify-no-ci-guard-duplication.mjs` — fails if `ci.yml` contains a
`run: npm run verify:X` whose `X` is already executed by a `verify-steps/*` file. Wire via verify-steps.

**Acceptance:** `build-typecheck` wall-clock drops to the target band; no guard stops running (compare
the guard-name set executed before vs after — must be a superset-or-equal).

---

## FIX 2 — Rebuild #2688 / #2689 / #2690 as single-lane PRs (do NOT patch)

These are 25–32 files across 3 module lanes each (and #2689 edits `SKILL.md` + branch-protection
config). Close/replace with **small, one-domain, frozen-scope** PRs:
- Split by top-level module lane (`apps/backend/<domain>`, `apps/frontend/<domain>`, `scripts/*` infra).
- **Infra (pipeline/verify-orchestration/branch-protection) merges ALONE**, never beside a feature.
- Any `SKILL.md`/rules edit → its own tiny **owner-reviewed** PR (governance lane). Architecture-design
  docs MAY stay with the feature that requires the same-commit update.

---

## FIX 3 — Shared registries: generate/shard, never hand-edit, NEVER json-union

- `scripts/sql-write-targets-known-debt.json` and `docs/schema-parity-baseline.json` conflict because
  many PRs hand-edit one shared file. Generate them from the ratchet, or shard into per-finding /
  per-migration fragments. **Do not add them to the json-union driver** — union resurrects removed debt
  and hides cleanup regressions. `schema-parity-baseline.json` is migration-adjacent → **owner OK before
  merge.**

---

## FIX 4 — Flaky shared-DB tests (fake-green breach)

Financial `*.db.test.ts` sharing one company/user → rerun-until-green. Give each test its own
company/user fixture; remove any "rerun on flake" affordance. Verify no financial fixture *logic*
changes (data-isolation only).

---

## Sequence & expected result
1. **FIX 0 + FIX 1 first** (today) — these two remove the forced rebase and halve CI.
2. FIX 2 (rebuild the fat PRs), FIX 3, FIX 4 in an isolated infra lane.
3. Merge Queue LAST (owner applies `strict:true` ruleset), then retire the local pre-push gate entirely.

**Honest expectation after FIX 0+1:** pushes stop mandating a rebase when there's no real overlap →
most branches go straight to green in the ~6–8 min CI band and merge. **"Zero conflicts ever" is not
literally achievable** — two PRs editing the SAME lines is a genuine conflict — but that's rare once
PRs are small/single-lane (FIX 2). The *forced-every-time* rebase is what FIX 0 kills.

## Report back with EVIDENCE (per §0 — no "done" without proof)
For each fix: the PR #, the guard name added, and a live measurement (FIX 0: a behind-but-clean branch
that pushed without rebase; FIX 1: before/after `build-typecheck` minutes + the guard-set diff).
