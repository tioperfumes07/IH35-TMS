# Master Recon Index — 2026-06-24

Single index of the app-wide recon sweep (Passes 1–7) + the parity build batch, with a **status** per finding.
Source docs live alongside this file in `docs/recon/`. Status legend:
**SHIPPED** (merged) · **HELD** (Jorge's call, do-not-touch) · **GATED** (Tier-1 / migration — needs ceremony) ·
**FLAGGED** (drift/decision for Jorge) · **PENDING** (recon in flight) · **OK** (verified clean).

> Verification discipline: a "SHIPPED" item is merged; it flips DIVERGES→MATCH only after GUARD live-crawls
> the deployed app. **UPDATE 2026-06-24: GUARD's live-crawl confirmed ALL maintenance tabs render MATCH**
> (R&M strip + sidebar, In-Transit Load#/ETA, Damage Reports formal register + Driver Reports tab, Road
> Service ETA/Response, Arriving Soon Severity, Severe Repairs Driver) — the maintenance parity batch is
> verified-complete. Create-WO width also live-verified (1140px). Source-present is a grep; rendered-live is GUARD's bar.

---

## A. The pass deliverables

| Pass | Scope | Doc | Headline |
|------|-------|-----|----------|
| 1 | Design-parity, all modules | `design-parity-app-2026-06-24.md` | 12 contract screens: 6 MATCH, 4 DIVERGES, 1 source-corrected, 1 match-now |
| 2 | CI guard audit (nominal vs real) | `guard-audit-2026-06-24.md` | ~640/695 guards NOMINAL (source-string); the **real** correction: `locked-guards` IS a live-required check |
| 3 | Data-source correctness | `data-source-map-2026-06-24.md` | 70 screens, **1 WRONG-SOURCE** (Damage Reports), **0 entity leaks** in UI reads |
| 4 | Stub inventory (façade vs real) | `stub-inventory-2026-06-24.md` | 14 silent stubs (3 HIGH, all financial); catalogs **54/61 real** ("34/65" was stale) |
| 5 | Money tie-out (Tier-1) | `money-tie-out-2026-06-24.md` | **PENDING** (read-only, in flight) |
| 6 | Entity-independence (Tier-1) | `entity-independence-2026-06-24.md` | **PENDING** (read-only, in flight) |
| 7 | Route-mount map | `route-mount-map-2026-06-24.md` | live WO-create = `CreateWorkOrderModal`; dead twin `WorkOrderCreateModal` (trap); ~85 dead components |

---

## B. Findings ledger (what was done about each)

### Maintenance design-parity (the build batch)
| Finding (Pass 1/3) | Fix | PR | Status |
|---|---|---|---|
| Arriving Soon — Open Issue/Severity split; Prep no data | columns + Prep deferred (not faked) | #1428 | SHIPPED |
| Severe Repairs — missing Driver | real `mdata.drivers` join | #1428 | SHIPPED |
| In-Transit — missing Load#/ETA | entity-scoped inline join (no migration) | #1428 | SHIPPED |
| R&M Status Board — missing 2nd stat strip | 8 tiles + 5 real KPI counts | #1430 | SHIPPED |
| R&M Status Board — sidebar layout | board + 168px sidebar + Road-Service-Active | #1432 | SHIPPED |
| **Damage Reports — WRONG-SOURCE** (driver_reports vs safety.incidents) | re-point to formal register (read-only) + new Driver Reports tab; Linked-WO deferred | #1435 | SHIPPED |
| Road Service — ETA/RESPONSE unrendered | render `on_scene_time` | #1436 | SHIPPED |
| Create-WO modal width 672px | `wide` prop → 1140px | #1433 | SHIPPED (live-verified by GUARD — CLOSED) |
| Create-WO render-v5 A–E + §7 | rebuild | #1426 | SHIPPED |

### Guard honesty (Pass 2)
| Finding | Fix | PR | Status |
|---|---|---|---|
| `verify:design-parity` NOMINAL (source-token, not DOM) | full-modal DOM render-test + re-point | #1431 | SHIPPED |
| Create-WO not ENFORCED; 4 contract tokens stale vs UI | align contract to live UI + promote to ENFORCED | #1434 | SHIPPED |
| R&M Status Board ENFORCED with **empty token list** (vacuous) | real tokens + render-test | #1436 | SHIPPED |
| Load-Wizard guard mapped **dead** `BookLoadCustomerSection` + 3 stale reefer tokens | re-map to live V4 + drop dead tokens (reefer = 1-field, Jorge's call) | #1437 | SHIPPED |
| `branch-protection-config.json:38` falsely claims arch-design runs in `ci/build-typecheck` | doc-drift, governance | — | FLAGGED (Jorge) |

### Held / gated (do-not-touch without Jorge)
| Finding | Why held | Status |
|---|---|---|
| **Load create drops `cash_advance_cents`/`fuel_advance_cents`** (real money loss) | Tier-1; design doc #1438 awaiting Jorge's 4 decisions; reuse existing advance→settlement rails, no raw load columns | GATED (#1438) |
| `driver_pay_rate_per_mile` dropped on create | by-design question (profile-rate fallback likely intentional) — **question, not a build** | GATED |
| Vendors/Customers hardcoded "—" money columns (Pass 4 HIGH) | financial panels | HELD |
| Lists-Hub tile counts read `accounting.qbo_remote_counts` (QBO mirror), not live `catalogs.*` | financial-adjacent; can show 0 for seeded catalogs | HELD |
| AP Aging bucket-filter not built | accounting / financial-adjacent | HELD |
| Load Book v6 reefer 3-field previews vs shipped 1-field | resolved: 1-field canonical (#1437 contract fix) | RESOLVED |

### Drift / decisions for Jorge (no build)
| Item | Decision needed |
|---|---|
| Maintenance Shell (Eng hrs · Last service) | `maintenance-FULL-with-chrome` vs `fleet-table` previews **disagree on columns for the same `FleetTablePage`** — which preview is canonical? (Eng hrs is Samsara-parked regardless.) |
| Dead `WorkOrderCreateModal.tsx` (name-collision trap) | archive (rename `.deprecated`) — Jorge's desk item |
| ~85 dead page components (Pass 7) | archive-candidates (ARCHIVE-never-DELETE); finance-adjacent ones gated |

---

## C. Cross-cutting trust notes
- **The parity wall blocks** (`locked-guards` is live-required) — but it's made of nominal bricks. Replacing bricks with DOM render-tests is the durable fix (done for Create-WO #1431, R&M #1436).
- **Entity-independence:** Pass 3 found 0 cross-entity leaks in UI reads; Pass 6 (pending) verifies at the schema/constraint level (the known `catalogs.accounts` global is the Path-B decommingle item, already tracked).
- **No faked columns shipped** — every data-less field deferred with a code comment + a guard `DEFERRED` entry (Arriving Soon Prep, Damage Reports Linked-WO, WO priority/close/odometer/engine-hrs).

_Last updated 2026-06-24. Passes 5 + 6 to be appended on landing._
