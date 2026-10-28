# ENG-36 measure — 2026-10-28 CT

## Count
- USMCA non-void company settlements: **87**
- Negative net: **21** (≤ ratchet ceiling 21; original claim 23)
- Guard `18841` PASS after require path `./lib` → `../lib`

## The 21 display_ids
5769, 5771, 5772, 5773, 5774, 5775, 5776, 5778, 5779, 5780, 5785, 5786, 5788, 5793, 5796, 5798, 5800, 5824, 5829, 5846, 5847

## Cause class
Fuel (+ expenses) exceed revenue on nearly every row; **5780** and **5796** have **rev=0**. This is ENG-25b / fuel-attribution territory — not missing `rate_total_cents` (fallback already live). No balancing JE.

## Code fix
`scripts/verify-steps/18841-verify-company-settlement-negative-ratchet.mjs` required missing `./lib/pg-connection-options.cjs`; corrected to `../lib/…`.
