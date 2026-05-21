# ARCHITECTURE_DELTA (Cursor Independent Draft)

Date: 2026-05-21  
Status: DRAFT (do not commit yet)  
Authoring constraint: drafted independently from existing architecture doc and current implementation shape.

---

## Intent

This delta proposes architecture-level changes required to operationalize:

1. Data sovereignty (local-runtime-read architecture), and  
2. Samsara telematics capability expansion (CAP-1..CAP-15 contracts).

This is an architecture contract draft, not a code patch.

---

## A) Data Sovereignty Architecture Additions

### A.1 Integration topology update

Introduce an explicit "Local Telematics Read Layer" and "Integration Sync Layer" split:

- **Local Telematics Read Layer**: query services that power dispatch/safety/fuel/maintenance UI exclusively from local stores.
- **Integration Sync Layer**: polling/webhooks/replay pipelines that hydrate local stores asynchronously.

### A.2 Canonical data flow

Proposed runtime flow:

1. Samsara/QBO/Relay webhooks + pollers ingest events.
2. Events persisted to local durable ingestion tables.
3. Projectors/materializers update domain read models.
4. UI/API read paths resolve from read models only.
5. Outbound sync/drift reconciliation runs async with audit trails.

### A.3 Failure-mode contract

- External outage must degrade freshness indicators, not break core office workflows.
- Every impacted view must show freshness and source metadata.
- Recovery must support replay without manual data surgery.

---

## B) Telematics Architecture Additions for CAP-1..CAP-15

### B.1 New/extended bounded contexts

- **dispatch.telematics_status** context: on_track/behind/delayed derivations.
- **safety.driver_scoring** context: score factors, snapshots, explanation traces.
- **safety.dot_inspection_visits** context: station dwell captures and outcomes.
- **maintenance.predictive_signals** context: odometer + engine-hours PM projections.
- **integrations.identity_integrity** context: Samsara-driver to QBO-vendor consistency checks.

### B.2 Cross-module event contracts (proposed)

- `telematics.position_updated`
- `telematics.status_transition_inferred`
- `telematics.dot_station_dwell_detected`
- `telematics.dtc_fault_detected`
- `maintenance.auto_wo_candidate_created`
- `safety.driver_score_recomputed`
- `integrity.samsara_qbo_mapping_violation_detected`

### B.3 Computation services (proposed)

- **Trip status evaluator**: computes on_track/behind/delayed from ETA variance and route progress.
- **Movement status evaluator**: transitions eligible operational states using movement/geofence precedence rules.
- **Predictive maintenance evaluator**: combines engine hours and odometer to produce due-risk bands.
- **Identity integrity evaluator**: validates linkage chain across driver master, telematics IDs, vendor/QBO IDs.

---

## C) UI/Route-level architecture impacts

### Dispatch

- Board/list rows need explicit trip-status chips (`on_track`, `behind`, `delayed`) with computation timestamp.
- Geofence and telemetry confidence indicators should be visible where trip-state is shown.

### Safety

- Add Driver Scoring page and DOT station dwell workflow integration points.
- Extend incident flows for dashcam reference linkage (if/when CAP-11 is locked to build).

### Maintenance

- Add predictive due cards driven by blended odometer+engine-hours signal.
- DTC fault ingestion to WO recommendation/auto-create policy path.

### Fuel

- Fuel planner recommendation traces should include HOS constraints used in ranking.

---

## D) Storage and model additions (architecture-level)

Proposed new logical model families (names illustrative in this draft):

- `samsara.station_geofence_catalog` (prebuilt/managed geofence definitions)
- `safety.dot_inspection_visits` (dwell-derived visit records)
- `dispatch.trip_status_snapshots` (status, variance inputs, version)
- `maintenance.predictive_pm_snapshots` (engine-hours + odometer model outputs)
- `safety.driver_score_snapshots` and `safety.driver_score_factors`
- `integrity.mapping_violations` (cross-system identity mismatch evidence)

---

## E) Non-goals for this draft

- No migration SQL proposed in this document.
- No endpoint signatures finalized in this document.
- No queue/backoff tuning changes are finalized here.

---

## Arbitration questions for Jorge

1. Should CAP-10 (driver scoring) and CAP-11 (dashcam) be architecture-locked now or listed as architecture placeholders pending business policy decisions?
2. Should DOT station geofence catalog be centrally managed in master-data-like tooling or safety-owned configuration?
3. Should auto-WO creation from DTC be hard policy or policy-driven with manual approval thresholds by severity/vendor availability?
