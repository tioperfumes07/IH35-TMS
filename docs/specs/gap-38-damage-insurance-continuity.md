# GAP-38 — Damage Reports + Insurance Claims Continuity (G15 · WF-027)

Source: **G15** master rule + **WF-027**. Damage tracking needs continuity from
the first report through final claim resolution, and insurance claims must link
back to the original damage event.

## Problem

Damage reports and insurance claims lived in separate tables with no enforced
linkage. Auditors could not trace a payout back to the original damage event,
nor see the `damage detected -> claim filed -> approved -> settled` chain.
WF-027 specifies that high-value damage incidents auto-create claim drafts; this
was not enforced.

## Schema reality (adaptation from the original spec)

The original GAP-38 brief assumed `safety.damage_reports` and
`safety.insurance_claims` tables. The live schema differs, so the spec was
adapted (additive only) to the canonical tables:

| Spec assumption            | Live schema (used here)                                   |
| -------------------------- | --------------------------------------------------------- |
| `safety.damage_reports`    | `safety.incidents` where `incident_type = 'damage_report'` |
| `safety.insurance_claims`  | `insurance.claim` (cents, `tenant_id`, role `ih35_app`)   |
| `gen_random_uuid_v7()`     | `gen_random_uuid()`                                       |
| role `app_user`            | role `ih35_app`                                           |
| `NUMERIC(12,2)` dollars    | integer cents (`bigint`)                                  |

## What shipped (ADDITIVE)

### Migration — `db/migrations/202606071600_damage_insurance_continuity.sql`

- Adds continuity columns to `safety.incidents`: `continuity_chain_id`,
  `parent_incident_id`, `auto_created_claim_id`, `final_resolution_status`
  (`open | claim_filed | claim_approved | claim_denied | self_paid | closed_no_action`).
- Creates `safety.damage_continuity_chains` (RLS-scoped to
  `operating_company_id`, `ih35_app` grants, monetary fields in cents,
  `audit_summary` JSONB event log).

### Continuity service — `apps/backend/src/safety/damage-continuity/continuity.service.ts`

- `startChain(initialDamageId)` → opens a chain, seeds estimated cost, links the
  initial damage.
- `appendDamage(chainId, relatedDamageId)` → attaches a related damage and
  recomputes the chain's total estimated cost.
- `closeChain(chainId, finalResolutionStatus, totalActualCostCents?)` → closes
  the chain and stamps resolution onto all linked damages.
- `getChain(chainId)` → full chain with linked damages + claim summary.

### Insurance link service — `apps/backend/src/safety/damage-continuity/insurance-link.service.ts`

- `autoCreateClaimFromDamage(damageIncidentId)` — per **WF-027**, when a damage
  estimate exceeds the `$1,000.00` threshold (`AUTO_CLAIM_THRESHOLD_CENTS =
  100000`), creates a draft `insurance.claim` attached to the tenant's active
  physical-damage / cargo / auto-liability policy and back-links it via
  `safety.incidents.auto_created_claim_id`. If no usable policy exists it skips
  creation (no false-positive orphan claims).
- `linkClaimToChain(chainId, claimId)` — records the claim on the chain.

### Worker — `apps/backend/src/jobs/damage-continuity-worker.ts`

Hourly cron (America/Chicago). Per company, opens chains for un-chained damage
reports and auto-creates/links claims above threshold. Disable with
`ENABLE_DAMAGE_CONTINUITY_WORKER=false`.

> **PAUSE guard:** if auto-claim drafting exceeds ~5% false-positive noise,
> disable the worker and tune the threshold before re-enabling.

### Routes — `apps/backend/src/safety/damage-continuity/continuity.routes.ts`

- `POST  /api/v1/safety/incidents/:id/start-continuity`
- `PATCH /api/v1/safety/incidents/:id/link-to-chain`
- `GET   /api/v1/safety/incidents/:id/continuity-chain`
- `POST  /api/v1/safety/incidents/:id/auto-create-claim`

### CI guard — `scripts/verify-damage-insurance-continuity.mjs`

Asserts the migration DDL, services, routes, worker registration, and docs are
present (`verify:damage-insurance-continuity`, wired into CI).

### Tests — `apps/backend/src/safety/damage-continuity/__tests__/continuity.test.ts`

Chain create/append/close/get, auto-claim threshold + policy handling,
idempotency, and tenant-scoped (RLS) query assertions.

## What was STOPPED (surfaced for preview, not built)

Per standing orders, **no UI change was made to existing locked pages.** The
damage-report detail view is rendered by the shared, locked
`apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx`
(used by damage reports, trailer interchanges, and cargo claims). The original
PIECE F UI work — editing the detail page to add a continuity panel, plus the
new `DamageContinuityChain.tsx` and `InsuranceClaimLinkBadge.tsx` components that
only render inside that locked surface — is deferred for preview/approval. The
CI guard therefore intentionally does not assert UI panels.

## Post-merge next steps

Integrates with the existing Insurance module and GAP-40 (photo EXIF chain) for
evidence integrity.
