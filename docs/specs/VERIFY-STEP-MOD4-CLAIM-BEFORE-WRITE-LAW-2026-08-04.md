# Verify-step collision law — mod-4 + claim-before-write (2026-08-04)

**Status:** LOCKED · owner-authorized · credit **CC-2 analysis**  
**Rules:** `.cursor/rules/25-verify-step-odd-even-bands.mdc`, `.cursor/rules/35-fix-failures-no-ci-babysit.mdc`  
**Guards:** `scripts/verify-verify-step-lane-band.mjs` · `scripts/verify-verify-step-claimed-on-main.mjs` (step **2400**)

## Problem class

Odd/even alone put **two Claude lanes on the same ODD residue**. Parallel merges + renumber "fixes" kept colliding (2361 → 2373 → again). Symptom renames burn days.

## Permanent controls

1. **Mod-4 bands:** Cursor EVEN · CC-1 ≡1 · CC-2 ≡3 (branch prefixes enforced).
2. **Claim-before-write:** number must exist on `origin/main` `CLAIMED-NUMBERS.json` **before** `scripts/verify-steps/NNNN-*.mjs` is authored. Claim-only PRs: `chore/claim-reserve*` / `chore/claimed-regen*` or subject `CLAIM-RESERVE` / `CLAIMED-REGEN`.
3. **No CI babysit:** read the failing log line, fix root cause, push (Rule 35).

## One-time bootstrap

Step **2400** (`verify-verify-step-claimed-on-main`) may land with its claim in the same PR once. After that, every new step requires a prior claim merge.
