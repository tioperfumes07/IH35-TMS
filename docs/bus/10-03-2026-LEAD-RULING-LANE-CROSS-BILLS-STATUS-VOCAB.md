# LEAD RULING — lane cross into CC-1 for ACCT-F2026100301/02/03 (2026-10-03)

**Ruling file for `LANE_CROSS=10-03-2026-LEAD-RULING-LANE-CROSS-BILLS-STATUS-VOCAB.md`.**

## What was measured

`/accounting/bills` rendered **"No bills found." / "No driver bills found." / 0 of 0** while printing
**"Vendor bills: 93 · $64,457.23"** and **"Driver bills: 136 · $94,640.08"** on the same page body.
Confirmed against production (Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, USMCA
`5c854333-6ea5-4faa-af31-67cb272fef80`, `SET LOCAL app.bypass_rls='lucia'`): `accounting.bills` 93
rows, `driver_finance.driver_bills` 136 rows, 0 voided. The same read under the pooled `ih35_app`
role returns 0 — RLS-masked, not empty; both were measured.

Cause: the page's default status selection is `active`, a **server pseudo-status**
(`applyBillListStatusFilter`, `apps/backend/src/accounting/bills.service.ts:192-209`). The server
honoured it and returned every row; the page then re-applied the same selection as a literal
membership test against each row's **canonical** status (`open|partial|paid|voided`), which never
equals `"active"`. Four of the seven selectable values — `active` (the default), `all`, `unpaid`,
`posted` — blank the entire register this way.

## The cross, and why it is unavoidable

Per `docs/bus/LANES.md`, the Lead owns `docs/bus/**`, `.github/workflows/**` and `claude/**` and no
module code. The fix is frontend (SHARED), but **its guard is not**:

| File | Lane | Why it must be touched |
|---|---|---|
| `scripts/verify-bill-status-filter-uses-shared-vocabulary.mjs` | CC-1 | DEFINITION-OF-DONE §4 requires a guard for any root fix. A fix without one is not done. |
| `scripts/verify-steps/12405-*.mjs` + `CLAIMED-NUMBERS.json` | CC-1 | §4 also forbids `package.json` wiring; a guard reaches CI only as a verify-step. |
| `scripts/verify-guards-do-not-run-as-ih35_app.mjs` | CC-1 | With no credential it handed `undefined` to `pg`, which dials **localhost:5432**. On a host whose local Postgres speaks SSL the guard would have PASSED, having verified a laptop and reported it as production. It blocked every push from a clean worktree. |
| `scripts/money-pr-local-gate.mjs` | CC-1 | Its credential substitution was gated on `DATABASE_URL` already being set, so it could only REPLACE a connection string, never SUPPLY one — and `.husky/pre-push` deliberately does not source `.env` (Rule 18). Every live money guard therefore failed "needs DATABASE_URL" on every push. Gate phases went **30 → 42 passing** once fixed. |

The last two are not optional scope: **without them this branch, and any branch cut from a clean
worktree, cannot be pushed at all.** Rule 5 — fix the blocker in the same session.

## Addendum — `claude/r387-banking-filter-survives-blur` (same ruling, one more CC-1 file)

`scripts/verify-bank-feed-filters-read-the-line-state.mjs` banned `onSearch` on the bank feed's
description filter outright. That pinned U26's **remedy** rather than the outcome U26 wanted, and the
remedy cost server-side narrowing: with no `onSearch` the box filters only the rows already loaded,
so an operator hunting a merchant that is not on the current page cannot find it and can only apply a
value that already appears in the list. The real requirement is "the typed filter survives the box
closing", which now has a mechanism — `Combobox`'s `searchIsValue`. The ban is therefore made
conditional: `onSearch` is allowed when, and only when, the `searchIsValue` prop rides with it, and
the check strips comments so prose about the prop cannot stand in for the prop. Proven both ways:
PASS with the prop, FAIL with it deleted. U26's diagnosis was right; its remedy is replaced, not
discarded.

## Ruling

1. The Lead crosses into CC-1's lane for exactly the four files above, on branches
   `claude/claim-reserve-12405` and `claude/r386-bills-status-vocab`. No other CC-1 file is touched,
   no baseline is edited, no threshold is raised, no guard is weakened.
2. The verify-step number is **12405**, allocated by `scripts/claim-verify-step.mjs --seat lead`, in
   the lead stagger. The earlier hand-picked 12397 fell in CC-1's band and is abandoned, unused.
3. CC-1 keeps ownership. Anything further in that lane goes back to CC-1.

## Two defects this exposed that are NOT fixed here, and need an owner decision

- **`verify-wiring-law-guard-registry-batch` fails on pristine `origin/main`: 153 unaccounted guards
  against a ceiling of 93.** Sixty guards were authored and never wired into CI — they have never
  executed. Wiring them crosses every seat's lane at once, so it is not done unilaterally.
- **`scripts/claim-verify-step.mjs` and `scripts/verify-lane-ownership.mjs` contradict each other.**
  The allocator offers a `lead` seat and instructs it to edit `CLAIMED-NUMBERS.json`; the lane guard
  declares that file CC-1's and refuses the edit. By construction every seat must write that registry
  to claim a number, so a registry only one seat may write serializes all six seats behind CC-1. The
  honest repair is to move `scripts/verify-steps/CLAIMED-NUMBERS.json` to **SHARED** in `LANES.md`.
  That is a `LANES.md` change affecting every seat, so it is proposed here rather than taken.

**Correction, recorded rather than quietly dropped.** An earlier note of mine said
`apps/frontend/src/components/Combobox.test.tsx` case **D2** was red on pristine `origin/main`. That
measurement was taken against a STALE clone of main in the cloud container. Re-run against the real
current `origin/main`, that file is 5 of 5 green. The earlier statement was wrong and is withdrawn.
