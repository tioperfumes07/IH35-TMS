# B19 Decision — USMCA Entity Scaffolding

**Original block:** B19 — USMCA entity scaffolding (RBC ready, not GO'd)  
**Source:** `Downloads/ab/00-MASTER-QUEUE-INDEX-52-BLOCKS.txt` — ON HOLD until Jorge greenlights USMCA

## Original Scope Summary

Multi-carrier USMCA scaffolding before July 2026 launch:

- USMCA-1: Multi-carrier isolation hardening (`operating_company_id` RLS audit)
- USMCA-2: USMCA-specific catalogs + chart of accounts seed
- USMCA-3: Soft-launch toggle + admin go-live workflow

Related GO files: `Downloads/final/block-USMCA-1-GO-*`, `USMCA-2-GO-*`, `USMCA-3-GO-*`

## Overlap With Shipped Work

| Original B19 intent | Shipped artifact | PR |
|---------------------|------------------|-----|
| Multi-carrier RLS hardening | USMCA-1 infra | #523 |
| Carrier seed + CoA bootstrap | USMCA-2 + `usmca-carrier-bootstrap.ts` | #524, #527 |
| Soft launch toggle | USMCA-3 activation toggle | #527 |
| July 2026 activation runbook | CLOSURE-13 USMCA July launch | [#564](https://github.com/tioperfumes07/IH35-TMS/pull/564) `d6a6336d0` |
| Activation state machine | `0402-usmca-activation-state.sql` + routes | CLOSURE-13 |
| Launch readiness CI guard | `verify-usmca-launch-readiness.mjs` | CLOSURE-13 |

**Remaining gap:** USMCA carrier is still `is_hidden=true` until Jorge executes July 2026 cutover — this is **operational**, not a missing code block.

## Recommendation: **SUPERSEDED**

B19 scaffolding is fully implemented across USMCA-1/2/3 and CLOSURE-13. No REVIVE block needed.

**Future work (operational, not B19):** Jorge executes `docs/runbooks/USMCA-JULY-2026-LAUNCH-RUNBOOK.md` at cutover.

## Sign-Off

Decision recorded 2026-06-08. B19 closed as SUPERSEDED — do not dispatch.
