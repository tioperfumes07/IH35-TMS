# SAF-ORPH-01/02 — Escrow forfeit sign (stacks on ACCT-R-01 #3533)

> **STATUS: RETIRED 2026-07-30** — GUARD-verified on prod. Forfeiture branch = `-NEW.amount_cents`;
> `forfeitDriverEscrow` updates `driver_finance.escrow_balances` same txn (#3542 + #3545).
> Scoreboard catch-up only — do NOT rebuild.


**FINDING:** SAF-ORPH-01/02 · **Lane:** FINANCIAL-HOLD · **Module:** accounting / driver-finance escrow  
**PR stack:** trigger half of escrow fix; write-path sync already merged as #3533.

## ROOT CAUSE
`accounting.apply_escrow_posting_delta` (0234) treated `deposit` +, `release` −, and **ELSE → +**. The forfeit path wrote `posting_type='adjustment'`, so forfeits **increased** `accounting.escrow_accounts.balance_cents`. Separately, `lib.feature_flags` had **0 rows** for `DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED` (no enable path).

## FIX
1. HELD mig `202608070000_escrow_forfeit_posting_type_sign_and_flag_seed.sql`:
   - CHECK adds `forfeiture`
   - Trigger: deposit +, release −, forfeiture −, ELSE RAISE
   - Seed flag `default_enabled=false` (no overrides)
2. `forfeitDriverEscrow` → `recordEscrowPostingOnly({ posting_type: "forfeiture", source_type: "forfeit" })`
3. Guards reconciled (`verify-escrow-forfeit-posting`, `verify-escrow-forfeit-sign-delta` step **1496**)

## LIVE GATES (Neon 2026-07-25, lucia)
- Flag rows before seed on prod: **0**
- Signed driver `legal.contract_instances`: **0** → clause-blocked UI
- Feature stays triple-gated / latent until Neon-apply + signed contracts + owner flag flip

## DELTA PROOF (throwaway `ih35-tms-verify-db` :54329)
- Apply-twice of 202608070000: OK
- deposit +50000 → balance UP; forfeiture −20000 → balance DOWN; adjustment RAISE
- Guard: `IH35_ESCROW_FORFEIT_DELTA_DSN=… node scripts/verify-escrow-forfeit-sign-delta.mjs` → `DELTA_PROOF_OK`

## OWNER
Neon-apply + ledger-backfill. **Do not flip the flag.**
