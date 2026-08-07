# PERMANENT LAW — VERTICAL SWEEP BY CLASS (owner-locked 2026-08-07)

**Work globally and universally, by SWEEPS and CLASSES. Not one module. Not one defect. Not the old
block way.** Owner directive, stated twice and restated after a regression.

This file is the shared, durable record. It applies to every lane and every agent.

---

## The shape of a correct block

1. **Measure the class GLOBALLY first — whole tree, every file type — before touching anything.**
   A number scoped to one directory or one glob is a false verdict, and it will be quoted later as if
   it were the truth. `CLS-GUC-CALLER-SCOPED` was reported as "75 ungated sites"; that was
   `*.routes.ts` only. The real figure across `apps/backend/src` was **230** — 123 in route files and
   107 in services. Half the surface was invisible because the measurement, not the code, was scoped.

2. **One root cause → ONE shared helper.** Make the safe form shorter than the unsafe one.
   Twenty-one copy-pasted `assertCompanyMembership` calls is not a fix — it leaves the same two-step
   ordering a reviewer has to notice is missing, which is why the omission spread in the first place.
   `setScopedCompanyContext(client, userId, companyId)` collapses assert-then-set-GUC into one call
   that cannot be got wrong.

3. **A ratcheting, mutation-proven guard registered in `docs/law/LAW.json`.** Baseline the known set so
   it can only SHRINK, and prove the guard fails on a real violation and passes when restored. A guard
   that has never been seen to go red is not a control.

4. **Drained only at zero live + guard. A slice is not a drain.**

---

## How the regression looked, so it is recognisable next time

On 2026-08-07 the CLS-GUC sweep was measured globally (1,002 GUC sites, 230 ungated), given a shared
helper, and given a ratchet — all correct. Then a 105-site codemod hit **one** failing test, the whole
sweep was **stashed**, and the session continued with one-off defect fixes.

Parking a global sweep because a single site resists is the old block way wearing new clothes. The
correct move is to fix the resisting site, or exclude exactly that one file with a written reason and
finish the other 104.

**Tell-tales that a lane has slipped back:**
- a PR that changes a single file
- a board row naming one screen
- a "slice N of M" plan
- a measurement taken inside one directory
- a stash containing an unfinished sweep

---

## Worked examples (both real, both in this repo)

- **`scripts/lib/mask-comments.mjs`** — four separate guards were matching their own patterns against
  raw source and therefore reading prose in comments as code. One offset-preserving masker fixed all
  four, instead of four local edits.
- **`apps/backend/src/_helpers/scoped-company-context.ts`** — 105 handlers were setting
  `app.operating_company_id` from caller-supplied input with no membership assertion. One helper,
  applied by codemod across the tree, took the global count from 230 ungated to 112.
- **`apps/backend/test-helpers/membership-aware-query.ts`** — the same sweep broke eight route-test
  fixtures identically (their mocks did not answer the membership probe). One shared test helper fixed
  the class; notably it wraps the mock so the REAL assert still runs, rather than `vi.mock`-ing the
  guard away, which would have deleted the control from every one of those tests.

---

## Interaction with the other permanent laws

- **Never defer inside your own lane.** If the class is yours, finish it in the same block; only
  genuinely other-lane work goes to `docs/audit/GUARD-WORKORDERS.md`.
- **Verify, never guess.** The global measurement is evidence, not an estimate — re-run it after the
  sweep and quote both numbers.
- **Findings are not recorded until they are on `origin`.**
