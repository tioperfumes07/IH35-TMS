# Lost-Work Audit — 2026-07-03

**Trigger:** the Users-page fix ("SWEEP-FIX-17-27 PR B") was specced but never built/merged, and loose block specs
in Downloads that were never registered as `.block-ready` blocks are invisible to `reconcile:blocks` — so nothing
flagged it as missing. This audit closes that hole by cross-referencing **every block spec Jorge downloaded since
2026-05-05** against `origin/main` + the merged-PR set.

## Method (deterministic, re-runnable)
1. Walk `~/Downloads` for `.txt`/`.md` files modified since 2026-05-05 that carry a build-block identity
   (a `Branch:` target, a `block_id`/`allowed_files`, or named artifact paths).
2. Dedupe by content hash (Downloads is full of zip+extracted and ` 2` copies).
3. Extract each block's **branch**, **named artifacts** (`apps/**/*.ts(x)`, `scripts/verify-*.mjs`, `db/migrations/*.sql`), and PR refs.
4. Classify against `origin/main` (7,691 files) + merged PRs (1,791):
   - **BUILT** — branch merged OR ≥1 named artifact present on main.
   - **HELD/GATED** — spec marks it HOLD-FOR-JORGE / on-hold / gated / design-doc / Neon-branch / deferred.
   - **BUILT-ELSEWHERE** — the feature is on main under a different filename (keyword/basename match).
   - **TRULY-LOST** — no trace on main, not held.

## Results
| Verdict | Count |
|---|---|
| Unique build-block files (deduped, since 2026-05-05) | **773** |
| BUILT (branch merged or artifacts on main) | **592** |
| Intentionally HELD / GATED / design-doc | 27 |
| Likely BUILT-ELSEWHERE (different filename) | 18 |
| **TRULY-LOST (candidates)** | **14** |
| Ambiguous (no verifiable branch/artifact — mostly docs/designs) | 122 |

**Interpretation:** ~77% of build-blocks are verifiably built; the real lost-work surface is ~14 blocks
(pending the per-block verification pass — at least CI-1 and OB4 are known false positives). See the verification
report appended below for confirmed verdicts + rebuild recommendations.

## The 14 TRULY-LOST candidates (pre-verification)
- P5-T12 auto-deduct on load abandonment (`load-abandonment.service`)
- P5-T17 road-service as 3rd R&M bucket (`WorkOrderTypeSelect`)
- RELIABILITY-05 event-spine heartbeat + `verify-no-swallow-on-money-paths.mjs`
- CLOSURE import-orchestrator (CSV import dry-run)
- SAFETY-1 HOS-violation-date TZ defaults (`companyTime.ts`)
- GAP-94 universal pagination + inline "+ Add new" widget
- CI-1 build-typecheck flake fix (**likely correctly-not-built — no flake exists**)
- OB4 nested-input sweep (**likely = the existing `verify-no-nested-box-pattern` guard**)
- OB2 dead-tab audit guard · `verify-hover-nav-presence` · STAGE-4 6999 system-account guard
- Safari-ITP + E2E-load-lifecycle test harnesses

## Also formally caught (the trigger)
**SWEEP-FIX-17-27 "PR B"** (owner-gated data actions: USERS-1 cleanup + prod create-guard + FACT test-vendor cleanup)
— specced, never built. Code halves now rebuilt: create-guard #1903, deactivate-control fix #1904. Data cleanup =
owner action.

## To re-run this audit
Regenerate `main-tree.txt` (`git ls-tree -r --name-only origin/main`) and `merged-prs.json`
(`gh pr list --state merged --limit 3000 --json number,title,headRefName,mergedAt`), then run the cross-reference
(the classification logic in this session; a packaged `scripts/audit-lost-blocks.mjs` is the follow-up so it runs
from `npm`). Recommend running it at each session boundary so no future "PR B" is silently lost.
