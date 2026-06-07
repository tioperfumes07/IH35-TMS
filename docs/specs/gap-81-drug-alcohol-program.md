# GAP-81: Drug & Alcohol Program Management Module

**Status:** Shipped  
**Wave:** P2-P · Lane A  
**Regulation:** FMCSA 49 CFR Part 382 — Controlled Substances and Alcohol Use and Testing

---

## Problem Statement

No centralized tracking of driver Drug & Alcohol consortium enrollment, FMCSA-compliant
random pool draws, chain-of-custody test records, or SAP referral workflows.
FMCSA audit risk if program is not documented and draw rates cannot be demonstrated.

---

## Architecture

### Schema Layer: `safety.da_*` (Additive)

Three new tables under the `safety` schema, additive alongside the existing
`compliance.drug_alcohol_*` tables (which handle compliance rate tracking and clearinghouse).

| Table | Purpose |
|---|---|
| `safety.da_program_enrollments` | Consortium membership per driver |
| `safety.da_test_records` | All six FMCSA Part 382 test types + result + chain of custody |
| `safety.da_random_pool_draws` | Quarterly draw audit trail (full UUID array + per-driver test kind) |

### Backend Module: `apps/backend/src/safety/drug-alcohol/`

| File | Role |
|---|---|
| `program.service.ts` | enrollDriver, scheduleTest, recordResult, flagPositive |
| `random-pool.service.ts` | Cryptographic Fisher-Yates shuffle; drawRandomPool; listDrawHistory |
| `routes.ts` | REST endpoints at `/api/safety/drug-alcohol/*` |

**Routes:**

```
GET    /api/safety/drug-alcohol/enrollments
POST   /api/safety/drug-alcohol/enrollments
DELETE /api/safety/drug-alcohol/enrollments/:uuid
GET    /api/safety/drug-alcohol/tests
POST   /api/safety/drug-alcohol/tests
PATCH  /api/safety/drug-alcohol/tests/:uuid/result
POST   /api/safety/drug-alcohol/tests/:uuid/flag-positive
GET    /api/safety/drug-alcohol/random-pool/draws
POST   /api/safety/drug-alcohol/random-pool/draw   (Safety Officer+, manual trigger)
```

### Worker: `apps/backend/src/jobs/da-random-pool-draw-worker.ts`

Quarterly cron: `0 7 1 1,4,7,10 *` (07:00 CST, January 1 / April 1 / July 1 / October 1).
Runs `drawRandomPool` for each active company that has enrolled drivers.
Disabled via `ENABLE_DA_RANDOM_POOL_DRAW_WORKER=false` env flag.

### Frontend: `apps/frontend/src/pages/safety/drug-alcohol/`

| Component | Role |
|---|---|
| `DrugAlcoholProgramTab.tsx` | Main tab: enrollment roster, positive-result SAP queue |
| `TestSchedulingPanel.tsx` | Form to schedule tests (all 6 FMCSA types, drug/alcohol/both) |
| `RandomPoolDashboard.tsx` | Quarterly stats + draw history + manual trigger button |

Tab route: `/safety/drug-alcohol` (already registered in SafetyGroupNav via SAFETY_TABS_CONFIG).

---

## FMCSA Part 382 Compliance Points

### §382.301 — Pre-employment testing
Covered by `test_type = 'pre_employment'` in `da_test_records`.

### §382.303 — Post-accident testing
Covered by `test_type = 'post_accident'`.

### §382.305 — Random testing
- Federal minimums: 50% drug / 10% alcohol **annually**.
- Quarterly target (spec): 10% drug / 10% alcohol per draw.
- Selection: cryptographic randomness (node:crypto `randomBytes` Fisher-Yates shuffle).
- Full audit trail: `drawn_driver_uuids UUID[]` + `drawn_test_kinds JSONB` stored verbatim
  in `safety.da_random_pool_draws` — auditor can verify exact selection.

### §382.307 — Reasonable suspicion testing
Covered by `test_type = 'reasonable_suspicion'`.

### §382.309 — Return-to-duty testing
Covered by `test_type = 'return_to_duty'` + SAP referral (`sap_referral_uuid` column).
`flagPositive()` in program.service marks the SAP referral slot; downstream RTD workflow
feeds GAP-68 Safety Officer home.

### §382.311 — Follow-up testing
Covered by `test_type = 'follow_up'`.

---

## Cryptographic Audit Compliance

**FMCSA requires that random selections be demonstrably random and not manipulable.**

`cryptoShuffle` uses `randomBytes(4)` per swap position (Fisher-Yates) — OS-level CSPRNG,
not seeded pseudo-random. Each draw's complete selection is persisted atomically.

> PAUSE condition from spec: "if random pool draw isn't reproducibly auditable (seed not
> persistent), STOP — FMCSA audit requirement."
>
> This implementation stores `drawn_driver_uuids[]` and `drawn_test_kinds JSONB` in the
> draw record. The selection is auditable by record, not by seed replay — which is stronger
> (no need to trust seed storage). Auditors see exactly who was drawn and what kind of test.

---

## Recon Notes

- Existing `compliance.drug_alcohol_*` tables and routes are **not modified** (additive only).
- `SafetyGroupNav.tsx` edit **skipped** — `drug-alcohol` tab already present in
  `SAFETY_TABS_CONFIG.ts` (Group: "Driver Files & Training", tab count = 27 already).
  Spec's "23 → 24" claim is stale from prior lane work.
- Frontend component files are NEW and composable into the existing `DrugAlcoholTab`.

---

## CI Guard

```sh
node scripts/verify-drug-alcohol-program.mjs
```

Checks: migration present + table names, all service functions, all routes, worker cron
expression, quarterly months, frontend files, block manifest. Exit 0 = pass.

---

## Post-Merge Next Steps

- Register `initializeDaRandomPoolDrawWorker(app)` in `apps/backend/src/index.ts`.
- Register `registerDrugAlcoholProgramRoutes(app)` in the backend route registry.
- Wire `DrugAlcoholProgramTab` into the existing `DrugAlcoholTab` or promote to primary tab content.
- SAP referral flow → feeds GAP-68 Safety Officer home.
- Chain-of-custody IDs → integrate with documents module.
