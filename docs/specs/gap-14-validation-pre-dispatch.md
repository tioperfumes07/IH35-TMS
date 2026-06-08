# GAP-14: Pre-Dispatch Validation Engine

**Wave:** G-F · **Lane:** A · **Approved:** 2026-06-07

## Problem

Pre-dispatch validation rules (CDL expiry, medical card, permits, unit OOS, DVIR major defect, driver active) fire in the backend but the operator sees no visible warnings before assigning. WF-050 hard-block returns 422 with no context.

## Solution

Adds a visible **Section D — Pre-dispatch validation** to `BookLoadModalV4` that runs all checks **before** the operator clicks Book, surfacing blockers (red, disables Book button) and warnings (amber, operator can acknowledge).

## Locked Design Decisions

| Decision | Value |
|----------|-------|
| Debt warning threshold | $500 (50,000 cents) |
| FMCSA cache staleness warn | > 24 hours |
| Medical card warning window | ≤ 30 days to expiry |
| CDL warning window | ≤ 30 days to expiry |
| Override workflow | Inline in BookLoadModal with reason text (audit trail) |

## Rules

| Rule ID | Severity | Trigger |
|---------|----------|---------|
| WF-CDL-EXPIRED | **block** | CDL expiry date in the past |
| WF-CDL-EXPIRING | warn | CDL expires within 30 days |
| WF-MED-CARD-EXPIRED | **block** | DOT medical card expired |
| WF-MED-CARD-EXPIRING | warn | Medical card expires within 30 days |
| WF-038-DRIVER-INACTIVE | **block** | Driver is deactivated (WF-038) |
| WF-050-DVIR-MAJOR | **block** | Unit has open DVIR major defect / dispatch-blocked (WF-050) |
| WF-044-PM-DUE | warn | Unit has open PM-due work order (WF-044) |
| WF-HOS-VIOLATION | **block** | Driver is in current HOS violation |
| WF-HOS-LOW | **block** | Driver has < 120 min drive time remaining |
| GAP-14-DRIVER-DEBT | warn | Driver outstanding debt > $500 |
| GAP-14-FMCSA-STALE | warn | Customer FMCSA cache > 24 hours old |
| GAP-14-FMCSA-NEVER-VERIFIED | warn | Customer has never been FMCSA-verified |
| GAP-14-FMCSA-NO-NUMBER | warn | Customer has no MC# or DOT# on file |

## Architecture

```
POST /api/v1/dispatch/validation/pre-dispatch
  body: { operating_company_id, driver_uuid?, unit_uuid?, trailer_uuid?, customer_id? }
  auth: Dispatcher+ (requireAuth)
  → validatePreDispatch() → { blockers[], warnings[], info[], can_dispatch }
```

**Frontend flow:**
1. `PreDispatchValidationPanel` watches `driver_uuid`, `unit_uuid`, `customer_id` in `BookLoadModalV4` form
2. On field change → POST to validation endpoint
3. Blockers → red alert, Book button disabled (unless override reason ≥ 10 chars provided)
4. Warnings → amber alert, operator can acknowledge each; booking proceeds

## Files

| File | Type |
|------|------|
| `apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts` | NEW |
| `apps/backend/src/dispatch/validation/pre-dispatch.routes.ts` | NEW |
| `apps/backend/src/dispatch/validation/__tests__/pre-dispatch.test.ts` | NEW |
| `apps/frontend/src/components/shared/ValidationPanel.tsx` | NEW (reusable) |
| `apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx` | NEW |
| `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx` | EDIT |
| `scripts/verify-pre-dispatch-validation.mjs` | NEW CI guard |
| `.block-ready/GAP-14-PRE-DISPATCH-VALIDATION.json` | MANIFEST |

## Post-merge

`ValidationPanel.tsx` is reused by GAP-15 (pre-settlement) and GAP-16 (pre-accounting).
