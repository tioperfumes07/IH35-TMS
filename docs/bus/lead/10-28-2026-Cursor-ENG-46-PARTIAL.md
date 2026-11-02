# ENG-46 PARTIAL — 2026-10-28 CT

## Tip-cleared
- **P-0102 → company 5796** on USMCA (not Transportation)

## Measured
- **ad02cc37**: `settlement_deduction_noncash=true`, memo escrow contribution P-0117, no bank txn **by design**; **0 JE spine** rows (counts in bill-payment spine ceiling 223)
- Escrow: driver view **320,000¢** / accounting view **397,500¢** (Δ 77,500¢) — prior 315k vs 132.5k claim **stale**

## Remaining
- Wire JE spine for noncash escrow contribution bill_payments (shrink ceiling)
- Tie driver escrow view to accounting escrow view (or name the 77,500¢ remainder)
