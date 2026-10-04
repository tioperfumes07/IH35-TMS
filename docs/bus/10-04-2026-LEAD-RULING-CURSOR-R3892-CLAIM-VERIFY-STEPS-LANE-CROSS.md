# LEAD RULING — CURSOR ROUND 389.2 claim verify-step numbers (EVEN band)

2026-10-04 · Cursor Lead (on Claude Lead ROUND 389.2 order) · authorizes LANE_CROSS for this filename

## The cross

    scripts/verify-steps/CLAIMED-NUMBERS.json         lane-owned by CC-1

ROUND 389.2 (Claude Lead box `10-04-2026-ALL-CODERS-WIRE-THE-1645-PASSING-GUARDS.md`) assigns
CURSOR 39 of the 1,645 DATABASE_URL-stripped PASSING orphan guards to wire via verify-step only.
Rule 37 / claim-before-write requires the numbers on `origin/main` before the wrappers land.
Those numbers are EVEN (Cursor band). Claiming them touches `CLAIMED-NUMBERS.json`.

RULED: CURSOR may ADD keys to `scripts/verify-steps/CLAIMED-NUMBERS.json` **and** ADD the matching
`scripts/verify-steps/<EVEN>-verify-<slug>.mjs` wrapper files for ROUND 389.2 under these limits.

1. ADD ONLY — never edit or remove another seat's existing entry / step file.
2. EVEN band only — `NUMBER % 4 === 2` (Cursor). This claim: **12330..12406 step 2** (39 slots).
3. Reservation PR first — CLAIM-RESERVE subject; no `scripts/verify-steps/<N>-*.mjs` wrappers in
   the same PR as the claim (Rule 37).
4. Wrappers after merge — second PR adds the 39 step files that call `node scripts/verify-<slug>.mjs`
   (ctx.run only; no package.json / locked-guards / ci.yml).
5. CITE THIS FILE — `LANE_CROSS=10-04-2026-LEAD-RULING-CURSOR-R3892-CLAIM-VERIFY-STEPS-LANE-CROSS.md`
   in the gate run and the same line in the PR body.

This ruling does not give CURSOR anything in CC-1's money / GL / posting lane. The 39 guards are
UI / design-law / chrome verifiers already measured PASS with DATABASE_URL stripped.

## Amendment 2026-10-04 — CURSOR triage of 3 FAILING orphan UI guards

ROUND 389.2 also assigns CURSOR **3 FAILING** orphan guards (Claude Lead
`10-04-2026-Claude-Lead-NOT-WIRED-204-FAILING-BY-SEAT.md`):

- `scripts/verify-navy-page-subnav.mjs`
- `scripts/verify-list-empty-settled.mjs`
- `scripts/verify-form-425c-exhibits.mjs`

Those script files are lane-owned by CC-1 in `verify-lane-ownership`, but Claude Lead
explicitly ordered CURSOR to triage them (code-wrong vs guard-wrong), fix, prove, then wire.
The triage also touches `apps/backend/src/reports/index.ts` (UNASSIGNED) where the 425c exhibits
route surface must match the guard.

RULED: CURSOR may EDIT the three verify scripts named above and ADD the minimal reports-index
wiring required for the 425c exhibits guard to pass, for ROUND 389.2 triage only. Same
`LANE_CROSS` filename. After green, CURSOR reserves EVEN verify-step numbers and wires the
three via `scripts/verify-steps/<N>-verify-<slug>.mjs` under the same ruling's ADD-ONLY /
EVEN-band limits.

## Amendment 2026-10-04b — ROUND 390.1 restore path bank-line release (gate unblock)

Tip main after ROUND 390.1 (#25148) left `restoreReversedJournalEntryInClientTx` setting
`reversed_by_je_id` without `releaseBankLinesNamingDocument` — `verify-every-void-releases-its-bank-lines`
fails on `apps/backend/src/accounting/journal-entries.service.ts` and blocks every CURSOR push that
sets DATABASE_URL. This is the ROUND 368.2(b) pattern already used in `posting-engine.service.ts`.

RULED: CURSOR may ADD the one `releaseBankLinesNamingDocument(... matched_journal_entry_id ...)`
call immediately before the restore path's `SET reversed_by_je_id` in
`apps/backend/src/accounting/journal-entries.service.ts`. No other JE void/post math. Same
`LANE_CROSS` filename.

## Amendment 2026-10-04c — reclassify undo guard matches ROUND 390.1 restore

`scripts/verify-reclassify-batches-are-whole.mjs` still required `reverseJournalEntryNoFlip` after
ROUND 390.1 replaced undo with `restoreReversedJournalEntryInClientTx`. Tip main is red the moment
any JE-service touch pulls this guard into the money gate.

RULED: CURSOR may retarget that one static assertion to `restoreReversedJournalEntryInClientTx`
(ROUND 390.1 law). No weakening of WORM / RECLASSIFICATION / savepoint / live invariants.
