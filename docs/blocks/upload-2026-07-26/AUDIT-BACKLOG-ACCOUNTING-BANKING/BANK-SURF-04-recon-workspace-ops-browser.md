# BANK-SURF-04 — Reconciliation workspace ops/browser (schema LIVE)
**FINDING:** BANK-SURF-04 (P0) · **Lane:** NON-FINANCIAL · **Module:** banking.
**REWRITE 2026-07-25:** companion to BANK-ECON-04. Migration `202608030000` **APPLIED**. Drop “Owner Neon-apply required.” Remaining = **ops-density + authenticated browser DoD** (Rule 23).

## RESPOND-BEFORE-CODING (Rule 00/02)
Spec: Banking Recon workspace · #3417 zero-diff · architectural Banking tabs
Tab count: unchanged
NEW SPEC: None · flags stay OFF · OWNER decides cutover · Fine GL decided (no re-ask)

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25]
- RLS lucia escape on `banking.bank_accounts`: **live**.
- UI + POST `/start` + `/complete` + zero-diff logic: treated as wired; sessions still 0 = **ops/browser proof outstanding**, not schema hold.
- Structural guards ≠ SURF PASS.

**Step 1:** TRANSP+USMCA browser: open Reconciliation workspace → start session → complete zero-diff (or honest error) → reload → reverse drill.

## LINKAGE
Same as BANK-ECON-04 · BOTH-WAY session↔account↔txns.

## THE FIX
1. Remove Neon-apply HOLD language from scoreboard (`owner_hold` false for this mig).
2. Complete browser DoD A–E + VERIFY 1–8 with live session row.
3. If blocked by app bug post-schema: fix code + guard — do not re-author 202608030000.

## GUARD
Keep structural recon guards; PASS only with live session + browser evidence.

## GIT-GATE COMMIT KEYS
FINDING: BANK-SURF-04
LANE: NON-FINANCIAL
DOD-A..E / VERIFY-1..8: UNVERIFIED until browser + sessions>0
MODULE_PROGRESS: banking N of M
ITEMS_TOUCHED: BANK-SURF-04
MIGRATE: **APPLIED** `202608030000` — ops/browser only
ROOT CAUSE: workspace was schema-blocked; schema live — SURF still open on live proof
FIX: browser recon + density; scoreboard honesty
GUARD: recon wiring guards
LIVE PROOF: UNVERIFIED: no live session browser proof yet
REMAINING: operator recon click-through TRANSP+USMCA
