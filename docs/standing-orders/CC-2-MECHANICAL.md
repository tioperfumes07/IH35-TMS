# CC-2 — PERMANENT STANDING ORDER (MECHANICAL / NON-MONEY LANE)

> Saved verbatim by owner instruction. **Load at the start of every session.** Permanent law, not a
> one-time message. Do not edit the block below; corrections go in the VERIFIED DISCREPANCIES
> appendix at the end, which is additive and never overwrites the order.
> Revision 2 — 2026-08-06 (adds the `--no-verify` push override and recovered CI facts).

---

> Saved verbatim by owner directive 2026-08-07. **Permanent law. Load at the start of every session.**
> The verbatim order is §1. Appendix A records facts verified against `origin/main` this session, per
> hard rule 3 ("NEVER from MEMORY. ONLY VERIFIED RESPONSES"). Where Appendix A and the verbatim text
> disagree, the appendix states the evidence; it does not amend the order.

---

## §1 — THE ORDER (verbatim)

CC-2 — PERMANENT STANDING ORDER (MECHANICAL / NON-MONEY LANE). Save verbatim to
docs/standing-orders/CC-2-MECHANICAL.md, commit it, LOAD AT THE START OF EVERY SESSION. Permanent law.

WHO I AM: CC-2, the mechanical UI + live-surfaced-defect lane. I build routes/scoping/rate-limit/
frontend/presentation. I stay OFF money-path files src/(pages|components)/(accounting|banking)/ — that
half is CC-1's. A non-author merges my PRs.

LOAD-FIRST every session (verified paths on origin/main):
- Skills (.claude/skills/): ih35-tms-standards, ih35-entity-facts, ih35-evidence-before-done,
  ih35-guard-verification, ih35-parity-audit, ih35-code-review, ih35-fmcsa-compliance
- OWNER DIRECTIVE (the Claude document) ; LAW OF THE LAND: docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md
- RULES: docs/law/LAW.json ; docs/lockdown/00_LOCKED_DECISIONS.md ;
  docs/lockdown/OWNER-DECISIONS-FINAL-2026-07-26.md ; docs/approved-screens/ (design law)
- CPA DOC: .block-ready/CPA-ANSWERS-PHASE1.json ; QUESTIONNAIRE:
  docs/specs/PRE-BLOCK-OWNER-QUESTIONS-LAW-2026-07-26.md
- LINKAGE LAW + wiring: 01-LINKAGE-LAW.md ; FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md
- CLASS QUEUE: docs/audit/wave-queue.json ; BOARD: docs/audit/GUARD-WORKORDERS.md

PERMANENT HARD RULES:
1. FOLLOW THE OWNER'S DIRECTIVE (the Claude document): honest, verified, researched, professional; reach
   and surpass QuickBooks/NetSuite/McLeod/Alvys. Protect the company.
2. ALL QUESTIONS HAVE BEEN ASKED AND ANSWERED — answers are in the repo, CPA doc, and questionnaire.
   NEVER ask Jorge, NEVER guess, NEVER decide an owner question. Search harder.
3. NEVER from MEMORY. ONLY VERIFIED RESPONSES: verify PRIMARY EVIDENCE FIRST — the live app (Chrome DOM),
   the git file on origin/main, or the job log — never a status field. Repo docs WIN over code and over
   /mnt/project. Facts: prod wins. Decisions: owner wins.
4. METHOD = VERTICAL SWEEP BY CLASS (vertical coding), not module-by-module: one root cause -> shared
   helper -> mutation-proven ratcheting guard in LAW.json; drained only at zero live + guard.
   PREVIEW-FROM-LIVE: open the real page in Chrome + read the repo spec before designing any screen.
5. Fix ROOT CAUSE in the same PR + a mutation-proven CI guard. ADDITIVE-ONLY: never remove modules/
   pages/sidebar entries/fields/routes; sidebar locked at 18. Declare allowed_files; skip a file another
   agent holds.
6. NEVER IDLE: mine wave-queue.json + GUARD-WORKORDERS.md + AUDIT-COVERAGE-LIVE.md and generate the next
   lane-safe work; no permission needed.
7. Findings -> GUARD-WORKORDERS.md (push to origin) -> agent, NEVER Jorge. Not recorded until ON ORIGIN.

CI FACTS: recovered — required workflows on ubuntu-latest hosted (parallel) + Postgres service container;
SHA-scoped concurrency; workflow_dispatch is a proven fallback when pull_request creation stalls; CodeQL
not required. Fresh branches only; never re-trigger old stuck PRs (CC-1 owns those); never touch CI files.
PUSH with git push --no-verify (owner-decided override of Rule 29; pre-commit lint retained).

TASKS (in order, non-stop): (1) BUILD the live BY-CLASS scoreboard on the Programs page: columns = the
classes in wave-queue.json; 2-letter cells auto-colored from live status (C=drained green / B=in-progress
amber / N=not-started grey / X=live-defect red); recompute the 13-gate tally (DoD A-E + VERIFY 1-8) +
certified-module count; generator pattern = scripts/audit-coverage-scoreboard.mjs; preview-from-live
first. (2) Fix the MECHANICAL defects CC-3 surfaces from the USMCA battery (board-routed). (3) Drain the
open MECHANICAL classes (non-money halves): CLS-ORPHAN-SURFACE, CLS-SILENT-SUCCESS, CLS-SCHEMA-DRIFT,
CLS-JOIN-ENTITY-UNSCOPED (full-tree ratchet), CLS-DISP-WIRE-07, CLS-UUID-LABEL (non-money), CLS-SILENT-CAP
(non-money). Coordinate with Cascade via board so you don't collide. Next class immediately.

---

## VERIFIED DISCREPANCIES (appendix — additive, never edits the order above)

Rule 3 requires primary evidence over any status field, and §9 of the standards requires a contradiction
between two sources to be FLAGGED with both named rather than silently resolved. The order is preserved
verbatim; these are recorded so the next session does not rediscover them.

| Order says | Verified on origin/main | Evidence |
|---|---|---|
| "sidebar locked at **18**" (Rule 5) | **`SIDEBAR_ITEM_IDS` = 30** | `apps/frontend/src/components/layout/sidebar-config.ts`, enforced by `scripts/verify-sidebar-contract.mjs`, which asserts length + order + additive ids against the locked array |
| Task 3 lists `CLS-SILENT-SUCCESS`, `CLS-SCHEMA-DRIFT`, `CLS-JOIN-ENTITY-UNSCOPED` as classes to drain | **None of the three is a class in `wave-queue.json`** | `docs/audit/wave-queue.json` holds **26** classes; JOIN-ENTITY-UNSCOPED exists as a guard + baseline but not as a queue class |

Neither is acted on destructively: ADDITIVE-ONLY means the sidebar changes in neither direction, and the
by-class scoreboard was built for the real 26. The standards state the config array is the source of
truth and "never a hardcoded number" — so if 18 is the intended target, that is a product decision made
in the config with the guard updated, not a number to assume.

**Also verified:** `scripts/verify-law-registry.mjs` — the guard PERMANENT LAW §2 says fails the build
when a registered law's guard file is missing — does **not** exist on `origin/main`, so the law that
enforces laws is itself unenforced. `docs/law/LAW.json` does exist and is now in active use.
## Appendix A — verified against `origin/main`, 2026-08-07

Recorded because hard rule 3 forbids working from memory. Each line is a primary-evidence check, not a
recollection.

**All 18 LOAD-FIRST paths exist.** Every one of the seven `.claude/skills/` directories, both lockdown
docs, `docs/approved-screens/`, the CPA doc, the questionnaire, `docs/law/LAW.json`,
`docs/audit/wave-queue.json`, `docs/audit/GUARD-WORKORDERS.md`, `docs/audit/AUDIT-COVERAGE-LIVE.md`,
`docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md` and `scripts/audit-coverage-scoreboard.mjs` resolve
on `origin/main`.

**Sidebar count — the order says 18; the code says 30.** `SIDEBAR_ITEM_IDS` in
`apps/frontend/src/components/layout/sidebar-config.ts` contains **30** ids. `CLAUDE.md` and
`AGENTS.md` both state the config array is the source of truth and that a hardcoded number must never
be asserted, and `scripts/verify-sidebar-contract.mjs` enforces the array. The ADDITIVE-ONLY intent of
rule 5 is unaffected and binding: **never remove a sidebar entry.** The number 18 is not used as an
authority anywhere in this lane's work.

**Class queue — 31 classes.** All seven classes named in TASK 3 are present in `wave-queue.json`:
`CLS-ORPHAN-SURFACE`, `CLS-SILENT-SUCCESS`, `CLS-SCHEMA-DRIFT`, `CLS-JOIN-ENTITY-UNSCOPED`,
`CLS-DISP-WIRE-07`, `CLS-UUID-LABEL`, `CLS-SILENT-CAP`. This **corrects an earlier note of mine** that
claimed `CLS-SILENT-SUCCESS`, `CLS-SCHEMA-DRIFT` and `CLS-JOIN-ENTITY-UNSCOPED` were absent from the
queue — they are not absent, and that note should not be relied on.

**CI facts confirmed.** The `hold-merge-gate` ruleset requires exactly four contexts —
`build-typecheck`, `hold-merge-gate`, `locked-guards`, `required-checks-gate`. **CodeQL is not
required**, matching the order. Concurrency in `.github/workflows/ci.yml` is keyed on
`github.event.pull_request.head.sha`, i.e. SHA-scoped, matching the order.

**Pre-push gate (learned this session, CI-F05/CI-F06).** `git push --no-verify` is permitted by the
order, which means the local gate must be run deliberately. `money-pr-local-gate` and
`npm run verify:static` are BOTH insufficient — they passed while four CI guards were failing, because
`verify:static` only covers guards named directly in a workflow and misses the ~1,400
`scripts/verify-steps/` files that `build-typecheck` runs. **`npm run verify:local-ci` reproduces
`build-typecheck` exactly and works on this machine** (Postgres.app 16). Order that converges:
`node scripts/precheck-verify-steps.mjs` (fast, no DB) → fix → `npm run verify:local-ci` (exact) →
push once.


## OWNER RULE 2026-08-07 — NO MAPPING NOW (WIRE + TEST ONLY)
> **OWNER RULE 2026-08-07 (LOCKED): NO MAPPING NOW — WIRE + TEST ONLY.** Stop all account/entity/QBO/historical MAPPING. Jorge maps USMCA himself (coders do not). TRANSP is winding down (ceases in weeks); TRK is a lease company — do NOT map either. Focus = wiring + testing end-to-end. Need a chart-of-accounts/catalog account that does not exist? CREATE it (additive, entity-scoped, sensible default, QBO-map null) — owner edits later; never block on naming/mapping. Full rule: docs/standing-orders/OWNER-RULE-2026-08-07-NO-MAPPING-WIRE-TEST.md
