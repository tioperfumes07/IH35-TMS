# Merge Treadmill — Approved Fix Stack (2026-07-18)

> **Single source of truth.** Reconciles GUARD (Claude Coder), Claude Agent, and Cursor after a
> 3-lane adversarial round. Every disputed fact was verified on disk/live this session. Owner-gated
> items are marked. More conservative reading wins on conflict (§0/§10).

## Verified facts (all three lanes now agree)

| Claim | Verdict | Proof |
|---|---|---|
| "`main` is completely unprotected" | **FALSE** | Ruleset **17935054** (`hold-merge-gate`) active, 4 required checks, `strict:false`. Only *classic* branch protection is 404. GUARD's original claim was wrong; Cursor corrected it. |
| Rebases are pure file conflict | **INCOMPLETE** | `scripts/verify-branch-fresh.mjs` FAILs (`exit 1`) if base is > `DEFAULT_MAX_COMMITS_BEHIND` behind `origin/main` on a **7-file allowlist** (verify-pre-commit, verify-architectural-design, known-prod-grants ×2, backend/accounting/index.ts, frontend/App.tsx, AccountingSubNav.tsx). A local freshness gate forces rebases with NO conflict. Cursor's catch. |
| CI runs the guard suite twice | **TRUE** | `ci.yml` runs `verify:pre-commit` (full ~156-step suite) then re-runs many individual `verify:*` steps already inside it. ~5 of the ~11 min is duplicate. Highest-ROI free win. |
| Big cross-cutting PRs | **TRUE, #1 driver** | #2690 = 32 files / 3 lanes; #2689 = 25 files incl. `SKILL.md` + branch-protection config. |
| GUARD's rerere + this plan file "don't exist" | **They exist in GUARD's clone, UNCOMMITTED** | Not a fake-green — the work is real and on disk (proven by SHA below); it was local-only so other worktrees were blind. Fix: this branch pushes it so every lane can verify. |

## Concessions folded in
- **rerere:** record-only, `autoupdate=false`, **opt-in — NOT installed via `npm prepare`** (Cursor). Removed from the setup hook; documented as a one-liner operator aid.
- **Debt registries:** **never json-union** — union resurrects removed debt and hides cleanup regressions (Cursor). Generate from the ratchet or use per-finding fragments.
- **PR-size gate:** by **module-lane spread + frozen scope + reviewed exception**, NOT a raw file-count cap (Claude Agent's ">8 files" withdrawn).
- **Governance gate:** protects the **law only** — `SKILL.md` / constitution / rules = governance-only lane. **Architecture docs may ride with their feature** (a tab change lawfully updates `IH35_ARCHITECTURAL_DESIGN.md` in the same commit). Claude Agent's blueprint-blanket withdrawn.

## Approved stack (leverage ÷ effort)

1. **De-dup `ci.yml`** — remove `verify:*` steps already covered by `verify:pre-commit`. Per-line check for a verify-steps wrapper before each removal (no blanket delete). ~11→~5 min. *Non-financial tooling.*
2. **Governance gate** — `apps/**` + `SKILL.md`/rules in one PR = hard fail; law edits go in a tiny owner-reviewed PR. Architecture docs excluded. *Touches the law → owner-reviewed by design.*
3. **Shared registries generated / per-finding fragments (NOT union)** — `sql-write-targets-known-debt.json`, `schema-parity-baseline.json`. *Migration-adjacent for schema-parity → owner OK.*
4. **PR-scope gate by module-lane + frozen scope + reviewed exception.** Split & rebuild #2688/#2689/#2690 — don't patch. *Non-financial tooling.*
5. **Infra in its own serialized lane** — pipeline/skill/branch-protection/verify-orchestration never merge beside features. *Non-financial tooling.*
6. **rerere record-only** (opt-in) + **relax `verify-branch-fresh` to warn-not-block when there is no actual conflict.** *Non-financial tooling.*
7. **Fix shared-DB test isolation** — per-test company/user; no rerun-until-green (fake-green breach). *Test/CI — verify no financial fixture logic changes.*
8. **Merge Queue — LAST**, only after CI is fast and shared-file conflicts are gone (needs ruleset → `strict:true`; can't run custom drivers, so it must not be the thing resolving them). *Owner applies the ruleset.*

## Open dispute to adjudicate (owner)
Cursor holds that a **"truthful runner" + "exact manifest/environment"** set are **active fake-green / gate-bypass P0 defects**, not deferrable plumbing. GUARD has **not seen that evidence** and — per §0 — will not rank them P0 on another lane's word (the same standard Cursor rightly applied to GUARD). **Ask Cursor to show the specific defect (the fake-green line / the bypassed gate); GUARD verifies it live; then it's ranked.** Symmetric law: no lane's "P0" counts without shared proof.

## Timebox (Claude Agent, amplified)
This is plumbing, not product. Ship 1 + 4 (+ 2 owner-reviewed) **now**; 3/5/6 in one isolated infra lane; then **resume feature blocks**. If throughput-repair balloons past a couple days, we've traded a merge problem for a delivery problem.

## Definition of done
- [ ] `ci.yml` de-dup merged; build-typecheck measured < 6 min.
- [ ] Governance gate live (owner-reviewed).
- [ ] Debt/schema-parity registries no longer hand-editable (generated/fragments).
- [ ] #2688/#2689/#2690 rebuilt as single-lane PRs.
- [ ] Cursor's runner/manifest defect shown → verified → ranked.
