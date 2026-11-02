# ENG-46 DONE-LIVE — 2026-11-02 CT

## Spine
- Cash posted bill_payments without JE spine = **0** (ceiling 0)
- Prior 223 "unlinked" were all `settlement_deduction_noncash` (by design; no JE)
- `ad02cc37` correctly noncash escrow contribution

## Escrow Δ77500¢ — NAMED (not a second ledger)
- `driver_finance.v_driver_escrow_balance` sum = **320000¢** (canonical; service uses this for driver holders)
- Raw sum of `accounting.v_escrow_account_balance` = **397500¢** because closed sibling escrow_accounts share a COA and each row inherits the full COA posting balance:
  - 2100-00-024 **closed** duplicate +42500¢
  - 2100-00-023 **closed** duplicate +35000¢
  - Δ = **77500¢**
- Driver view correctly excludes closed when an active sibling exists on the same COA
- No balancing JE. No second system rewrite.
