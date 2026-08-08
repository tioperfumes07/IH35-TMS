# NO-COLLISION LANE SYSTEM — enforced, not prose (2026-08-07)

Autoload every session. Supersedes the prose-only RoE in
`docs/blocks/class-sweeps/00-RULES-OF-ENGAGEMENT-NO-COLLISION.txt` by making it ENFORCED.
Per LAW = ENFORCED GUARD OR IT IS NOT LAW.

## Why we collide (verified 2026-08-07)
Two DISTINCT failure modes, each needs its own fix — one alone is not enough:
1. **Textual collision** — two agents edit the SAME file in parallel → the 2nd PR goes DIRTY.
   Cause: lane discipline is prose only; nothing fails a PR that reaches into another lane's files.
2. **Merge-race / semantic collision** — a PR is CLEAN, another PR merges, now the first is DIRTY
   or (worse) silently breaks main (a rename here, a caller there). Both passed CI alone.
   Cause: no merge queue — PRs are tested against a stale main, not against main+the queue ahead.

## The four layers (build in THIS order — order matters)

### Layer 1 — ENFORCED PATH LANES  (kills textual collisions at the source)
- Machine-readable lane map: `docs/lanes/LANE-OWNERSHIP.json` (below). Each agent owns DISJOINT
  path globs. A `shared_hot` list holds the genuinely-shared files.
- Guard `scripts/verify-lane-ownership.mjs` (REQUIRED check): reads the PR's changed files + the
  PR's lane (branch prefix `cc1/ cc2/ cc3/ cascade/ cursor/`, or a `LANE:` PR-body tag). FAILS if
  the PR touches a file outside its lane and NOT in `shared_hot`. Mutation-proven self-test.
- Guard `scripts/verify-hotfile-single-open-pr.mjs` (REQUIRED): FAILS if >1 OPEN PR touches the
  same `shared_hot` file. Forces serialization on shared files (App.tsx, backend index.ts, the
  shared registries, the program pages, LAW.json). This is the token mechanism, enforced.

### Layer 2 — GITHUB MERGE QUEUE  (kills the merge-race / clean→DIRTY / broke-main)
- Add `merge_group:` to the `on:` trigger of EVERY required workflow FIRST (ci, hold-merge-gate,
  required-checks, locked-guards). If a required check does not run on `merge_group`, the queue
  silently blocks — this is the #1 setup failure. Verify each required check name matches EXACTLY.
- THEN enable `merge_queue` in ruleset 17935054 (or branch protection). Merge method = squash.
- Result: GitHub tests each PR on a temp branch = main + the PRs ahead of it, and merges in order.
  "Clean→DIRTY after someone merged" and silent semantic breakage stop happening.
- Known caveat (research): native queue had a documented silent-revert incident; keep the
  post-merge forensic 5-point (merge commit on main, CI green, deploy live, Neon state, no regress).

### Layer 3 — SPLIT THE HEAVY CHECK  (keeps the queue moving)
- `build-typecheck` runs the full verify chain + migration replay (45–75 min). In a queue that
  serializes, one 75-min job per PR makes the queue crawl.
- Split: fast gate `build-typecheck-fast` (tsc + guards + fast unit) = REQUIRED, queue-friendly.
  Slow `migration-replay` = its own check; required on money/migration PRs only, informational or
  post-merge on non-money. Same coverage, far less serialization. (Research: fast checks required,
  slow integration post-merge.)

### Layer 4 — STANDARD BRANCH PREFIXES  (so the lane guard can infer the agent)
- CC-1 → `cc1/*` · CC-2 → `cc2/*` · CC-3 → `cc3/*` · Cascade → `cascade/*` · Cursor → `cursor/*`.
- PR title keeps its existing prefix convention. The branch prefix is what the lane guard reads.

## LANE MAP (source for Layer 1 — build LANE-OWNERSHIP.json from this)
- **cc1 (money/financial/CI):** apps/backend/src/accounting/**, apps/backend/src/banking/**,
  apps/backend/src/settlements/**, apps/backend/src/factoring/**, apps/*/migrations/**,
  apps/frontend/src/pages/accounting/**, apps/frontend/src/pages/banking/**, .github/workflows/**
- **cc2 (mechanical/FE/ops):** apps/frontend/src/pages/{dispatch,fleet,maintenance,program,fuel,
  driver,safety,insurance,legal}/**, apps/backend/src/{dispatch,fleet,maintenance,home,safety}/**
- **cc3 (live verifier):** docs/audit/LIVE-*.md, docs/audit/LIVE-TXN-BATTERY-*.md (verifier notes;
  authors little app code — when it must, it declares the target lane and serializes)
- **cascade (auditor/merger):** docs/audit/wave-queue.json, docs/audit/AUDIT-COVERAGE-LIVE.md,
  docs/audit/class cards, scripts/verify-* RED-INVENTORY guards only (never feature fixes)
- **shared_hot (serialize — ONE open PR each, any lane, must hold the token):**
  apps/frontend/src/App.tsx, apps/backend/src/index.ts, scripts/verify-pre-commit.mjs,
  scripts/verify-architectural-design.ts, docs/law/LAW.json,
  apps/frontend/src/pages/program/AuditScoreboardPage.tsx,
  apps/frontend/src/components/** (shared components)

## ACCEPTANCE (all enforced, not prose)
- verify-lane-ownership + verify-hotfile-single-open-pr are REQUIRED checks, mutation-proven,
  registered in docs/law/LAW.json.
- merge_group runs every required check; merge_queue enabled; a synthetic merge-race PR is caught
  by the queue (proven on a throwaway pair).
- build-typecheck split; queue throughput measured (p95 time-in-queue recorded).
- A PR that reaches into another lane's file FAILS ci; a 2nd open PR on a hot file FAILS ci.
