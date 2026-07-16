# 11 — LEGAL + INSURANCE

**Verdict:** Matter detail exists; claim detail missing; cross-module FKs held; accident cosmetic fields.

## Legal
| Tab | Route | Status |
|-----|-------|--------|
| Contracts, Templates, Policies, Attorney Review, Matters, Reports | `/legal/*` | Tabs HAVE; flyout misses Matters/Reports |
| Matter detail | `/legal/matters/:id` | HAVE (own Link, not EntityLink) |
| Matter → claim/unit/incident | Held FKs | MISSING UI |

## Insurance
| Nested | Route | Status |
|--------|-------|--------|
| Policies, Type Catalog, Coverage Gaps, Claims, Lawsuits | `/safety/insurance/*` | HAVE list surfaces |
| Claim detail `:id` | — | MISSING |
| ClaimsTab asset→unit EntityLink | Suspicious | DRIFT |
| Lawsuit → ?claim_id= | Ignored by InsuranceTab | DEAD |

## Claim graph (required)
Claim→Accident/Police · Driver · Unit · Load · Legal · Policy · Expense/Bill · WO · Driver receivable · Settlement — **end-to-end NOT FOUND**.

## Professional recommendation
Ship held FK migrations with owner gate; claim detail route + EntityKind; bind accident drawer fields that today look editable but don’t save; bidirectional links. Court-grade — no inventing amounts.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `pages/legal/*` · `pages/safety/tabs/InsuranceTab.tsx` · `pages/insurance/*`

### Legal tabs / buttons
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Module tabs Contracts/Templates/Policies/Attorney Review/Matters/Reports | `LegalModuleTabs.tsx:4-11` | URL navigate | HAVE |
| Sidebar flyout Legal | `sidebar-config.ts:235-241` | **Omits Matters + Reports** | DRIFT |
| Matter detail route | `manifest.tsx:3232` `/legal/matters/:id` | Detail page | HAVE |
| Matter back link | `LegalMatterDetailPage.tsx:123` | `<Link to="/legal/matters">` | HAVE |
| Matter related driver | `LegalMatterDetailPage.tsx:165` | Raw `<Link to=/drivers/...>` not EntityLink | DRIFT |
| Matter → claim/unit/incident EntityLink | Not found as EntityKinds | Held FKs / no kinds | MISSING |
| + Create matter | `LegalMatterNewPage` via `/legal/matters/new` | Create flow | HAVE |

### Insurance nested
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Nested nav Landing/Policies/Type Catalog/Coverage Gaps/Claims/Lawsuits | `InsuranceTab.tsx:17-34` | Nested routes | HAVE |
| Policy detail `:policyId` | `InsuranceTab.tsx:40` · `PolicyDetail.tsx` | HAVE | HAVE |
| Claims list | `InsuranceTab.tsx:43` · `ClaimsTab.tsx` | List only | HAVE |
| Claim detail `:id` route | Grep manifest: **no** `/claims/:id` under insurance | | MISSING / WILL FAIL |
| Claims asset → unit EntityLink | `ClaimsTab.tsx:86` | `EntityLink kind="unit" id={claim.asset_id}` | DRIFT (asset≠unit?) |
| Lawsuit → claim link | `LawsuitsTab.tsx:78-79` | `/safety/insurance?claim_id=` | DEAD |
| InsuranceTab reads `claim_id` | `InsuranceTab.tsx` — no `useSearchParams` | Query ignored | DEAD |
| Coverage gaps unit EntityLink | `CoverageGapDashboard.tsx:69` | `kind="unit"` | HAVE |

### Top WILL FAIL (new evidence)
1. **No claim detail route** — Claims tab is list-only (`InsuranceTab.tsx:43`); cannot open a claim by id.
2. **Lawsuit claim_id deep-link is dead** — `LawsuitsTab.tsx:78` writes `?claim_id=`; `InsuranceTab` never reads it.
3. **Matter→claim/incident graph not clickable** — no EntityKinds for claim/matter/lawsuit; matter detail uses ad-hoc Links only.

### Additional explorer evidence
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Claim → Policy link | `ClaimsTab.tsx:81-82` | → `/safety/insurance?policy_id=` — landing ignores; real detail is `/safety/insurance/policies/:policyId` | WILL FAIL |
| Contracts bulk Void | `LegalContractInstancesPage.tsx:214-216` | Disabled / not wired | STUB |
