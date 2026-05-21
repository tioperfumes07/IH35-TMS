# BLUEPRINT DELTA — Reconciled Draft (Resolved)

Date: 2026-05-21  
Status: DRAFT ONLY (no commit)  
Purpose: Arbitration-applied blueprint draft ready for canonical append.  
Style: synthesized canonical per TRACE-01 (2026-05-21). Source mapping in `DELTA_COMPARISON_CLAUDE_VS_CURSOR_2026-05-21`.

---

## Part 14 — Data Sovereignty

IH35-TMS shall maintain operational resilience against third-party outages by using local canonical data at runtime. Third-party APIs (QBO/Samsara/Relay/Plaid) are used for synchronization, webhook ingestion, and reconciliation only.

### Locked invariants

- **MUST-DS-1** Runtime operational reads SHALL resolve from IH35-managed local stores, not synchronous third-party API calls.
- **MUST-DS-2** External-facing entities SHALL be durably written locally first, then synchronized via queue/worker patterns.
- **MUST-DS-3** Integrations SHALL define delta cadence, full-sync cadence, and event-ingestion paths.
- **MUST-DS-4** Integrations SHALL degrade gracefully during third-party outages: local reads continue, write-back queues, clear user warning, and audit events for outage/recovery.
- **MUST-DS-5** Mirror schemas SHALL preserve external identity and sync metadata sufficient for replay/rebuild/reconciliation.

---

## Part 15 — Samsara Capability Invariants (CAP-1..CAP-15)

This section formalizes telematics capabilities and their required contracts across dispatch, fuel, maintenance, safety, and accounting integrity surfaces.

### CAP-1 through CAP-15 (locked capability set)

1. Real-time GPS visibility for active loads  
2. Auto-geofence lifecycle per dispatch stops  
3. Arrival prompt threshold correction to 250-foot standard  
4. Auto-status switching from movement/geofence context  
5. Dispatch taxonomy: on_track / behind / delayed (+ risk/complete handling)  
6. HOS-driven fuel stop planning  
7. Predictive maintenance using odometer + engine_hours  
8. DTC severity policy enabling auto-WO path  
9. Event-time vehicle-driver attribution across safety/maintenance/fuel/dispatch  
10. Safety driver scoring surface  
11. Dashcam incident integration  
12. DVIR in safety (already completed capability)  
13. DOT inspection station geofence dwell tracking workflow  
14. Practical/short/actual mileage three-way reporting model  
15. Samsara driver ↔ QBO vendor integrity checks

### Cross-capability invariants

- **MUST-CAP-1** Samsara-derived operational data SHALL be persisted locally before it drives dispatch, fuel, safety, maintenance, or reporting workflows.
- **MUST-CAP-2** Each Samsara entity used in workflows SHALL maintain stable mapping to canonical TMS entities with auditable change history.
- **MUST-CAP-3** CAP-3 correction is normative: **the arrival geofence size is 250 feet, not 25 miles as previously documented**. The prior 25-mile value was a documentation error and must not be reused.
- **MUST-CAP-4** CAP-5 status taxonomy names and semantic intent are locked in canonical docs; exact numeric thresholds and recompute cadences are implementation-policy values defined outside this blueprint delta.
- **MUST-CAP-5** CAP-13 workflow contract is locked (visit detection, outcome workflow, unresolved alerting, fine-link path), while specific thresholds, enum variants, and seeded station sets are implementation-policy values.
- **MUST-CAP-6** CAP-14 remains routing-engine agnostic in canonical text; whichever engine is selected must support practical/short/actual outputs required by reporting and downstream accounting/driver-pay workflows.
- **MUST-CAP-7** CAP-15 integrity is locked at invariant level: one canonical driver identity must reconcile with both Samsara driver identity and QBO driver-vendor identity, with unresolved mismatches surfaced for remediation.

---

## Follow-up (same session, non-blocking commit gate)

After arbitration and merged deltas, refresh:

- `docs/specs/SAMSARA_CAPABILITY_MATRIX_2026-05-21.md`
