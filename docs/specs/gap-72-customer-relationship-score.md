# GAP-72 — Customer Relationship Score + Health

## Purpose

GAP-72 adds a tenant-scoped relationship health score for customers so operations and account managers can quickly identify customers that are thriving, healthy, watch, or at risk.

## Data Model

Migration: `db/migrations/202606080221_customer_relationship_scores.sql`

Table: `master_data.customer_relationship_scores`

- `customer_uuid` (PK)
- `operating_company_id`
- `computed_at`
- `overall_health_score` (0-100)
- `health_tier` (`thriving`, `healthy`, `watch`, `at_risk`)
- `engagement_subscore`
- `payment_behavior_subscore`
- `service_quality_subscore`
- `margin_trend_subscore`
- `complaint_subscore`

RLS is enforced on `operating_company_id`, with lucia bypass support for background workers.

## Scoring

Service: `apps/backend/src/customers/relationship-score/scorer.service.ts`

Subscores (0-100):

1. `engagement_subscore` (25%)
2. `payment_behavior_subscore` (30%)
3. `service_quality_subscore` (25%)
4. `margin_trend_subscore` (10%)
5. `complaint_subscore` (10%)

Overall score is a weighted average. If a source is unavailable, the corresponding subscore is `null` and the overall score re-normalizes using only available subscores.

Tier thresholds:

- `thriving` >= 85
- `healthy` >= 65
- `watch` >= 45
- `at_risk` < 45

## APIs

- `GET /api/v1/customers/:uuid/relationship-score`
- `GET /api/v1/customers/relationship-scores/at-risk`

Both routes are authenticated and tenant scoped via `app.operating_company_id`.

## Worker

Worker: `apps/backend/src/jobs/customer-relationship-scorer.ts`

- Runs every 6 hours
- Iterates active operating companies
- Recomputes and upserts scores for active customers

## Frontend

- Component: `apps/frontend/src/components/customers/CustomerRelationshipScore.tsx`
- Detail page integration: `apps/frontend/src/pages/CustomerDetail.tsx`
- List health column (equivalent customer list page): `apps/frontend/src/pages/customers/CustomersListView.tsx`

## Verification

- Script: `scripts/verify-customer-relationship-score.mjs`
- NPM gate: `npm run verify:customer-relationship-score`
