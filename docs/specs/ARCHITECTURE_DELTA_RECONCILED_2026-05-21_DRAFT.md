# ARCHITECTURE DELTA — Reconciled Draft (Resolved)

Date: 2026-05-21  
Status: HISTORICAL DRAFT — audit trail; canonical content lives in IH35_UNIFIED_BLUEPRINT_ADDITIONS.md and IH35_ARCHITECTURAL_DESIGN.md  
Purpose: Arbitration-applied architecture draft ready for canonical append.
Style: synthesized canonical per TRACE-01 (2026-05-21). Source mapping in `DELTA_COMPARISON_CLAUDE_VS_CURSOR_2026-05-21`.

---

## Module A — Data Sovereignty Architecture Layer

Define a strict split between:

- **Local Read Layer**: serves operational UI/API from local persisted models.
- **Sync/Ingest Layer**: pollers + webhook handlers + replay/reconciliation workers.

Reference flow:
1. Third-party poll/webhook ingest
2. Append-only event persistence
3. Projection/materialization to local mirrors/read models
4. Operational reads from local models only
5. Async reconciliation + drift finding logging

Design detail policy for this module is invariant-first: canonical architecture text locks structure and boundaries, while concrete table conventions and fixed reconciliation storage targets are defined in implementation specs.

---

## Module B — Telematics Capability Architecture (CAP-1..CAP-15)

### B.1 Core contexts

- dispatch telematics status derivation
- fuel HOS-constrained planning
- maintenance predictive signals
- safety scoring/incident integration
- identity integrity validation across systems

### B.2 Event contract family (conceptual)

- telematics position updated
- geofence event received
- status transition inferred
- DTC fault detected
- auto-WO candidate created
- driver score recomputed
- integrity mapping violation detected

Event taxonomy detail policy is contract-first: capability-aligned event families are locked here; per-capability table schemas are defined in implementation specs unless explicitly locked otherwise.

---

## Module C — CAP-13 DOT Inspection Station Dwell Tracking

Required architecture outcomes:

- preconfigured station geofence catalog
- dwell detection events and persistence
- safety outcome workflow (unknown -> resolved states)
- alerting for stale unresolved visits
- linkage path to eventual fines/dispositions

### CAP-13 locked schema shape (resolved lock-now item)

The architecture locks CAP-13 core schema objects and outcome enum set now:

```sql
CREATE TABLE catalogs.dot_inspection_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_name text NOT NULL,
  state_code text NOT NULL,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('state_dps','state_police','port_of_entry','federal','other')),
  highway_designation text NOT NULL,
  center_lat numeric(10,7) NOT NULL,
  center_lng numeric(10,7) NOT NULL,
  radius_feet integer NOT NULL DEFAULT 500,
  dwell_threshold_minutes integer NOT NULL DEFAULT 5,
  active boolean NOT NULL DEFAULT true,
  samsara_geofence_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE safety.dot_inspection_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  station_id uuid NOT NULL REFERENCES catalogs.dot_inspection_stations(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid REFERENCES mdata.drivers(id),
  dispatch_id uuid REFERENCES dispatch.dispatches(id),
  entry_at timestamptz NOT NULL,
  exit_at timestamptz,
  dwell_minutes integer NOT NULL,
  outcome_status text NOT NULL DEFAULT 'unknown' CHECK (outcome_status IN
    ('unknown','no_action','warning_issued','fine_pending','fine_received','false_positive')),
  outcome_recorded_at timestamptz,
  outcome_recorded_by_user_id uuid REFERENCES identity.users(id),
  related_fine_id uuid REFERENCES safety.fines(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Seed geography policy remains implementation-managed (not hardcoded in canonical architecture text). Initial station seeding priority is tracked in implementation artifacts.

---

## Module D — CAP-3 / CAP-5 behavioral computation specifics

Architecture must support:

- corrected arrival prompt threshold behavior (CAP-3)
- deterministic dispatch status derivation and transition notifications (CAP-5)

Concrete thresholds/cadences are not hardcoded in this architecture delta. Algorithm shape and transition semantics are locked; policy values are finalized in config/implementation specifications.

---

## Module E — CAP-7/CAP-8/CAP-9/CAP-15 data-model detail

Architecture requires:

- event-time assignment attribution capability
- DTC severity policy mapping with automation controls
- predictive maintenance inputs including engine_hours
- cross-system identity integrity reporting

Data-model detail policy is invariant-first for CAP-7/CAP-8/CAP-9/CAP-15 in canonical architecture text; detailed DDL remains in implementation specs and migrations.

---

## Module F — Deferred architecture expansion items

The following items are valid but intentionally deferred from this first canonical architecture commit:

- QBO sync quality engineering guardrails
- routing engine decision module framing
- generalized webhook architecture pattern
- temporary old-software reference-reading module

---

## Traceability confirmation

TRACE-01 resolved to synthesized canonical style. Comparison and PR artifacts preserve source mapping and verbatim contentious snippets for auditability.

---

## Follow-up (same session, non-blocking commit gate)

After arbitration and merged deltas, refresh:

- `docs/specs/SAMSARA_CAPABILITY_MATRIX_2026-05-21.md`
