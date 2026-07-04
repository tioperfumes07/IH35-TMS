# REPAIR B — Deduction authorization (DESIGN, SIMPLIFIED by owner decision F)
2026-07-04 · financial-cluster §1.4 · DESIGN DOC. Owner sign-off gate. See [[audit-fix-decisions-2026-07-04]].

## Problem (G11-1)
`legal/signed-finance-handoff.service.ts` gates deduction posting on a signed template code
`driver_deduction_auth`, which does NOT exist → `hasSignedDeductionAuthorization` always false →
`settlement-posting.service` throws `CONSENT_MISSING` for any settlement with a deduction.

## Design — NO driver e-sign flow (decision F)
The signed **HIRE CONTRACT** authorizes payroll deductions. So:
1. Seed a `driver_deduction_auth` authorization record backed by the hire contract (owner attestation that
   the signed hire contract covers pay/escrow deductions), so `hasSignedDeductionAuthorization` returns true
   for active drivers — OR relax the gate to accept the hire-contract signature as the authorization.
2. Do NOT build a driver-facing e-sign / consent-template UI.
3. When the Legal module later builds the hire-contract template, it carries the deduction authorization
   clause for NEW drivers; the gate then reads that signature.
4. CI guard: the code(s) the gate queries ⊆ the seeded/allowed authorization codes (no future drift).

## Rollout
Neon test branch: with the authorization satisfied, a deduction-bearing settlement passes the gate + posts.
Owner sign-off before merge. Removes a whole build vs the original consent-template plan.
