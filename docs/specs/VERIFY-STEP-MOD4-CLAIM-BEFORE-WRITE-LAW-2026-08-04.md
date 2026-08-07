# Verify-step collision law — mod-4 + claim-before-write (2026-08-04)

**Status:** LOCKED · owner-authorized · credit **CC-2 analysis** · **Rule 37 extension 2026-08-05**  
**Rules:** `.cursor/rules/25-verify-step-odd-even-bands.mdc`, `.cursor/rules/35-fix-failures-no-ci-babysit.mdc`, `.cursor/rules/37-claim-merge-then-author.mdc`  
**Guards:** `scripts/verify-verify-step-lane-band.mjs` · `scripts/verify-verify-step-claimed-on-main.mjs` (step **2400**) · wired into `scripts/money-pr-local-gate.mjs`

## Problem class

Odd/even alone put **two Claude lanes on the same ODD residue**. Parallel merges + renumber "fixes" kept colliding (2361 → 2373 → again). Symptom renames burn days.

**2026-08-05 recurrence:** Cursor opened dozens of feature PRs that added `verify-steps/NNNN-*.mjs` before `NNNN` was on `origin/main`, and combined claim+guard on `chore/claim-reserve-*` (bypassing claimed-on-main via `regenSamePr`). Local gate did not run claimed-on-main → CI-only failure after ~7 minutes.

## Permanent controls

1. **Mod-4 bands:** Cursor EVEN · CC-1 ≡1 · CC-2 ≡3 (branch prefixes enforced).
2. **Claim-before-write (Rule 25 + Rule 37):** number must exist on `origin/main` `CLAIMED-NUMBERS.json` **before** `scripts/verify-steps/NNNN-*.mjs` is authored.
   - Claim-only PRs: `chore/claim-reserve*` + subject `CLAIM-RESERVE` — edit **only** `CLAIMED-NUMBERS.json`.
   - Feature PRs: author the step file **after** merge; **never** edit CLAIMED.
   - Atomic claim+file: **only** `chore/claimed-regen*` / subject `CLAIMED-REGEN` (registry tooling).
3. **Local = CI:** `money-pr-local-gate` runs `verify-verify-step-claimed-on-main` before push.
4. **No CI babysit:** read the failing log line, fix root cause, push (Rule 35).

## One-time bootstrap

Step **2400** (`verify-verify-step-claimed-on-main`) may land with its claim in the same PR once. After that, every new step requires a prior claim merge.
