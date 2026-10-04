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
