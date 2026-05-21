# BLUEPRINT_DELTA (Cursor Independent Draft)

Date: 2026-05-21  
Status: DRAFT (do not commit yet)  
Authoring constraint: drafted independently from canonical blueprint and current code/state, not as a review of Claude delta text.

---

## Intent

This delta proposes two new blueprint-level additions:

1. A **Data Sovereignty** section that formalizes local-first operational truth for third-party integrations.
2. A **Samsara Capability Invariants** section that formalizes a 15-capability telematics roadmap, including what is locked now vs deferred.

These additions are designed to be additive and compatible with existing integration adapter and outbox patterns in `IH35_MASTER_BLUEPRINT_v3_FULL.md`.

---

## Proposed Addition A: New Blueprint Part 14 — Data Sovereignty and Local Runtime Reads

### Rationale

Current blueprint already contains local durability and outbox-first language for QBO and persisted cache hierarchy for Samsara. This part consolidates that intent into explicit cross-integration invariants to prevent future drift.

### MUST-DS-1 through MUST-DS-5 (proposed normative text)

- **MUST-DS-1 (Local Runtime Read Rule):** At runtime, all operational UI/API reads must resolve from IH35-owned data stores (PostgreSQL/Redis/local caches) and must not depend on live third-party API response latency or availability.
- **MUST-DS-2 (Durable-First Write Rule):** Any externally synchronized entity must be written durably to local DB first, then queued for outbound sync. External outage cannot cause local operation failure.
- **MUST-DS-3 (Integration Boundary Rule):** Third-party APIs (QBO/Samsara/Relay/Plaid) are used only for sync, webhook ingestion, and explicit backfill/reconciliation jobs, not direct user-path reads.
- **MUST-DS-4 (Replay and Recovery Rule):** All inbound webhook/poll events must be persisted with replay metadata sufficient to reprocess without data loss after outages, deploys, or schema migrations.
- **MUST-DS-5 (Source-of-Truth Rule by Entity):** Every mirrored entity declares one local canonical table and one external reference key. Cross-system disagreements produce auditable conflict rows; no silent overwrite.

### Suggested insertion anchors in current blueprint

- Near current integration and SoR invariants in Part 3.2 and Part 3.12.
- Cross-reference to 3.15 cache hierarchy for Samsara.
- Cross-reference to outbox queue and conflict handling language.

---

## Proposed Addition B: New Blueprint Part 15 — Samsara Capability Invariants (CAP-1..CAP-15)

### Framing

Define each capability as one of:

- **Locked now** (spec and implementation required in near-term),
- **Locked design / deferred build** (design contract now, implementation later),
- **Future candidate** (explicitly out of current commit scope).

### CAP set (proposed contract text)

1. **CAP-1 Real-time GPS on active loads**  
   - Rule: dispatch load views must include near-real-time position freshness metadata with stale/degraded handling.

2. **CAP-2 Auto-geofence per dispatch**  
   - Rule: every pickup/delivery/fuel/border stop must resolve to geofence configuration at load/stop creation; geofence generation failures are auditable and retryable.

3. **CAP-3 Arrival prompt distance standardization (250-foot)**  
   - Rule: arrival prompt threshold is defined in feet (250-foot default), replacing legacy broad-radius interpretations where applicable.

4. **CAP-4 Auto-status switch on vehicle movement**  
   - Rule: movement events may transition eligible driver/load operational states under deterministic precedence and audit logging.

5. **CAP-5 Dispatch trip-status taxonomy**  
   - Rule: on_track / behind / delayed statuses are computed from GPS telemetry vs planned route/schedule variance.

6. **CAP-6 HOS-driven fuel stop planning**  
   - Rule: fuel planner recommendation engine must consume HOS limits in stop selection/ranking.

7. **CAP-7 Maintenance prediction (odometer + engine hours)**  
   - Rule: PM predictions use both odometer and engine-hours signals where available.

8. **CAP-8 DTC fault to auto-work-order flow**  
   - Rule: qualifying DTC events create triage records and may auto-open work orders by policy.

9. **CAP-9 Event-time vehicle-driver pairing**  
   - Rule: incident/fuel/WO attribution uses pairing valid at event timestamp, not current assignment only.

10. **CAP-10 Driver scoring in Safety**  
    - Rule: Safety module provides a driver scoring surface with explainable factors and auditability.

11. **CAP-11 Dashcam integration**  
    - Rule: incident workflows can link relevant dashcam artifacts and immutable references.

12. **CAP-12 DVIR in Safety**  
    - Rule: retain as implemented capability and reference current shipped state.

13. **CAP-13 DOT inspection station geofence dwell tracking**  
    - Rule: station geofence dwell over threshold creates inspection-visit records and downstream compliance workflow hooks.

14. **CAP-14 Practical/short/actual mileage three-way**  
    - Rule: reports expose three mileage bases with explicit reconciliation and variance reason codes.

15. **CAP-15 Samsara driver to QBO vendor integrity**  
    - Rule: cross-system identity integrity checks must validate that telematics driver identity maps to canonical driver-vendor accounting identity.

---

## Suggested migration/implementation notes (non-blocking in this draft)

- No schema migrations are included in this delta draft.
- No endpoint-level changes are included in this delta draft.
- This file is a blueprint contract proposal only.

---

## Review questions for Jorge arbitration

1. Confirm Part numbering strategy if canonical blueprint already uses internal part labels that would collide with "Part 14/15".
2. Confirm CAP-3 canonical wording as "250-foot" and identify every legacy reference to supersede.
3. Confirm which CAP items are "locked now" vs "locked design/deferred build" for immediate branch scope.
