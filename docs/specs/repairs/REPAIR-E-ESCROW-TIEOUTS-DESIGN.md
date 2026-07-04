# REPAIR E — Escrow return-on-separation + reconciliation tie-outs (DESIGN)
2026-07-04 · financial-cluster §1.4 (migration + money movement) · DESIGN DOC. Owner sign-off gate.

## Problem (BF8/BF4)
Escrow return-on-separation NOT BUILT (dead cols only) → held-in-trust money never auto-returned; escrow in
THREE parallel systems (2 read screens 500 on phantom cols); escrow deduction can't post
(`escrow_load_abandonment_recovery` role key not in the allowed CHECK → ACCOUNT_ROLE_BINDING_MISSING);
liability-type asserted on only one path; factoring reserve in THREE unreconciled ledgers; no
GL-control↔sub-ledger tie-out anywhere.

## Design (decision E: 60–90d net of claims; pay-first keeps escrow growing)
1. Canonical escrow ledger = `accounting.escrow_accounts` (only one posting real JEs); retire/bridge
   `driver_finance.escrow_balances`; fix the two phantom-column read 500s (real cols:
   transaction_type/amount_cents/running_balance_cents/created_at).
2. Return-on-separation: on `mdata.drivers.deactivated_at`, schedule a release after the claims window
   (60–90d, owner-set), net of open claims/deductions, via `releaseEscrow` — HUMAN-approved (Owner/
   Accountant), never auto-paid. (Escrow is drawn LAST — decision D — so the buffer covers late fines.)
3. Add `escrow_load_abandonment_recovery` to the allowed settlement-posting role-key CHECK + seed the
   LIABILITY binding (Driver Escrow, QBO-1150040187); add a hard `account_type='Liability'` assertion in
   `resolveRoleAccount` for EVERY escrow role (defense-in-depth vs QBO mis-typing).
4. Control-account↔sub-ledger reconciliation report (per role account: GL balance vs sub-ledger open
   balance) with flag-every-divergence (mirrors RECON-01): ar_control↔open invoices, ap_control↔open bills,
   clearing↔net_pay, factoring liability/reserve↔sub-ledgers.
5. ONE authoritative factoring reserve ledger (GL `factor_reserve_held`); the others become reconciling views.

## CI guards / rollout
verify-escrow-roles-are-liability; verify-escrow-return-exists; the tie-out report becomes a monitored check.
Neon test branch: contribute→hold→deduct→separate a test driver, assert the escrow liability nets correctly
+ a return is scheduled after the window + the tie-out shows GL control = sub-ledger for all buckets.
Owner sign-off + staging verify before any live entry/return.
