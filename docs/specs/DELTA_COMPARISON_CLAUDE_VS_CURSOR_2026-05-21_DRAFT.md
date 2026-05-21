# DELTA COMPARISON (Claude vs Cursor Draft)

Date: 2026-05-21  
Status: DRAFT (do not commit yet)  
Method: strict file-to-file comparison completed against:

- Claude files:
  - `/Users/jorgemunoz/Downloads/05-21-26-Updated-BluePrint, Architecture, TMS Change Report/BLUEPRINT_DELTA_2026-05-20.md`
  - `/Users/jorgemunoz/Downloads/05-21-26-Updated-BluePrint, Architecture, TMS Change Report/ARCHITECTURE_DELTA_2026-05-20.md`
  - `/Users/jorgemunoz/Downloads/05-21-26-Updated-BluePrint, Architecture, TMS Change Report/IH35-TMS-CHANGE-REPORT-2026-05-20.md`
- Cursor files:
  - `docs/specs/BLUEPRINT_DELTA_CURSOR_INDEPENDENT_2026-05-21_DRAFT.md`
  - `docs/specs/ARCHITECTURE_DELTA_CURSOR_INDEPENDENT_2026-05-21_DRAFT.md`

---

## Side-by-side classification

### C-01 Data Sovereignty top-level addition

- AGREE (locked content, ready to commit):
  - Both deltas add a top-level sovereignty layer and local-first runtime behavior.
  - Both explicitly bind this to resilience and third-party outage tolerance.
  - AGREE source mapping (synthesized): Claude `BLUEPRINT_DELTA_2026-05-20.md` Part 14 + Cursor `BLUEPRINT_DELTA_CURSOR_INDEPENDENT_2026-05-21_DRAFT.md` Proposed Addition A.
- DISAGREE (both sides shown, Jorge arbitrates):
  - Claude: prescribes concrete MUST-DS-1..DS-5 plus default sync cadences/threshold tables inside blueprint.
  - Cursor: keeps MUST-DS-1..DS-5 but leaves exact cadence/threshold values to implementation follow-up docs.
  - Verbatim snippet (Claude): "MUST 14.2.2 — Each integration ... SHALL have a documented sync cadence..."
  - Verbatim snippet (Cursor): "MUST-DS-3 ... Third-party APIs ... used only for sync, webhook ingestion, and explicit backfill/reconciliation jobs..."
- ONE-SIDED (one has it, the other doesn't — discuss):
  - Claude-only: explicit cadence table and drift thresholds in blueprint text.
  - Cursor-only: explicit insertion-anchor caution if part numbering collision occurs in canonical blueprint.

### C-02 Runtime reads must be local, third-party APIs used for sync/webhooks only

- AGREE:
  - Substantive rule matches exactly across both.
  - AGREE source mapping (synthesized): Claude Part 14.2.1 + Cursor MUST-DS-1/DS-3.
- DISAGREE:
  - Claude: stronger "no synchronous third-party call in user request path" wording.
  - Cursor: same principle but expressed as architecture boundary between read layer and sync layer.
  - Verbatim snippet (Claude): "No code path that responds to user requests ... SHALL call third-party APIs synchronously."
  - Verbatim snippet (Cursor): "Introduce an explicit 'Local Telematics Read Layer' and 'Integration Sync Layer' split."
- ONE-SIDED:
  - Claude-only: explicit user-facing degraded banner behavior in blueprint invariant block.

### C-03 New Samsara capability framework (CAP-1 through CAP-15)

- AGREE:
  - Both provide CAP-1..CAP-15 structure and scope.
  - AGREE source mapping (synthesized): Claude Part 15 capability list + Cursor Proposed Addition B CAP set.
- DISAGREE:
  - Claude: turns many capabilities into detailed MUST statements with concrete defaults (timers, radii, enums).
  - Cursor: intentionally keeps capability contracts higher-level in independent draft; recommends lock-now vs deferred-build arbitration first.
  - Verbatim snippet (Claude): "MUST 15.3.5.2 — Status SHALL be recomputed every 5 minutes..."
  - Verbatim snippet (Cursor): "Define each capability as one of: Locked now / Locked design, deferred build / Future candidate."
- ONE-SIDED:
  - Claude-only: detailed per-capability prescriptive values (for example recompute intervals and threshold windows).

### C-04 CAP-3 correction (25-mile legacy wording -> 250-foot)

- AGREE:
  - Both treat correction as required and critical.
  - AGREE source mapping (synthesized): Claude CAP-3 correction clause + Cursor CAP-3 arrival prompt standardization.
- DISAGREE:
  - Claude: declares hard correction language in blueprint delta text.
  - Cursor: agrees but requests explicit supersession mapping of all old references before final merge.
  - Verbatim snippet (Claude): "CORRECTION ... The arrival geofence size is 250 feet, not 25 miles..."
  - Verbatim snippet (Cursor): "arrival prompt threshold is defined in feet (250-foot default), replacing legacy broad-radius interpretations..."
- ONE-SIDED:
  - Claude-only: directly references correcting existing shipped/legacy wording context.

### C-05 CAP-2 auto-geofence on dispatch stops

- AGREE:
  - Both require stronger invariant than current partial spec.
  - AGREE source mapping (synthesized): Claude CAP-2 + Cursor CAP-2.
- DISAGREE:
  - Claude: explicitly includes create-and-delete lifecycle with stop-type defaults.
  - Cursor: requires auto-creation but does not yet lock cleanup/deletion behavior in independent draft.
  - Verbatim snippet (Claude): "On dispatch deletion or completion, the corresponding Samsara geofences SHALL be removed via API..."
  - Verbatim snippet (Cursor): "every pickup/delivery/fuel/border stop must resolve to geofence configuration at load/stop creation..."
- ONE-SIDED:
  - Claude-only: explicit geofence removal on dispatch completion/deletion.

### C-06 CAP-5 dispatch status taxonomy (on_track/behind/delayed/at_risk/complete)

- AGREE:
  - Both include taxonomy as required capability.
  - AGREE source mapping (synthesized): Claude CAP-5 + Cursor CAP-5.
- DISAGREE:
  - Claude: provides concrete threshold definitions and recompute cadence.
  - Cursor: defines the same concept but keeps thresholds open for final arbitration.
  - Verbatim snippet (Claude): "`on_track` ... within 30 minutes ... `behind` 30-120 ... `delayed` >120"
  - Verbatim snippet (Cursor): "Dispatch trip-status taxonomy ... computed from GPS telemetry vs planned route/schedule variance."
- ONE-SIDED:
  - Claude-only: explicit threshold boundaries (+30/+120 min) and recompute every 5 minutes.

### C-07 CAP-6 HOS-aware fuel planner

- AGREE:
  - Both define HOS-constrained fuel recommendation requirement.
  - AGREE source mapping (synthesized): Claude CAP-6 + Cursor CAP-6.
- DISAGREE:
  - Claude: explicitly ties fuel ranking to Loves pricing and algorithm-version persistence.
  - Cursor: keeps algorithm constraints and provider assumptions more abstract pending implementation design lock.
  - Verbatim snippet (Claude): "Fuel price source: Loves daily price upload ... Recommendation algorithm SHALL minimize cost-per-mile..."
  - Verbatim snippet (Cursor): "fuel planner recommendation engine must consume HOS limits in stop selection/ranking."
- ONE-SIDED:
  - Claude-only: full algorithm sketch in architecture delta.

### C-08 CAP-7 odometer + engine-hours predictive maintenance

- AGREE:
  - Both require engine-hours extension beyond current odometer-only behavior.
  - AGREE source mapping (synthesized): Claude CAP-7 + Cursor CAP-7.
- DISAGREE:
  - Claude: proposes concrete new columns and PM formula defaults.
  - Cursor: specifies context-level requirement but avoids locking schema/formula in independent draft.
  - Verbatim snippet (Claude): "ALTER TABLE mdata.units ADD COLUMN current_engine_hours numeric(10,2)..."
  - Verbatim snippet (Cursor): "PM predictions use both odometer and engine-hours signals where available."
- ONE-SIDED:
  - Claude-only: explicit migration-level columns and recompute SQL sketch.

### C-09 CAP-8 DTC severity to auto-work-order flow

- AGREE:
  - Both require policy-based DTC-to-WO automation.
  - AGREE source mapping (synthesized): Claude CAP-8 + Cursor CAP-8.
- DISAGREE:
  - Claude: details catalog table and insert behavior for auto-create path.
  - Cursor: requires policy/threshold framework but leaves table design to later schema phase.
  - Verbatim snippet (Claude): "CREATE TABLE catalogs.diagnostic_severity_thresholds ..."
  - Verbatim snippet (Cursor): "qualifying DTC events create triage records and may auto-open work orders by policy."
- ONE-SIDED:
  - Claude-only: explicit `catalogs.diagnostic_severity_thresholds` design proposal.

### C-10 CAP-9 event-time vehicle-driver pairing generalization

- AGREE:
  - Both define this as required generalization beyond fuel-only pairing.
  - AGREE source mapping (synthesized): Claude CAP-9 + Cursor CAP-9.
- DISAGREE:
  - Claude: proposes append-only assignment history table + helper view.
  - Cursor: defines invariant and evaluator expectations without locking schema objects.
  - Verbatim snippet (Claude): "CREATE TABLE mdata.unit_driver_assignments ..."
  - Verbatim snippet (Cursor): "incident/fuel/WO attribution uses pairing valid at event timestamp, not current assignment only."
- ONE-SIDED:
  - Claude-only: concrete table/view design for event-time pairing queries.

### C-11 CAP-10 driver scoring + CAP-11 dashcam

- AGREE:
  - Both include these as new capabilities.
  - AGREE source mapping (synthesized): Claude CAP-10/CAP-11 + Cursor CAP-10/CAP-11.
- DISAGREE:
  - Claude: detailed event model suggestions for scoring and dashcam linkage.
  - Cursor: requires capability and auditability but leaves detailed model for post-arbitration design.
  - Verbatim snippet (Claude): "CREATE TABLE safety.driver_scoring_events ..."; "CREATE TABLE safety.dashcam_events ..."
  - Verbatim snippet (Cursor): "Safety module provides a driver scoring surface with explainable factors and auditability."
- ONE-SIDED:
  - Claude-only: specific event types and table sketches for scoring/dashcam.

### C-12 CAP-12 DVIR in safety marked complete

- AGREE:
  - Both treat as already implemented and not new design scope.
  - AGREE source mapping (synthesized): Claude CAP-12 status note + Cursor CAP-12 status note.
- DISAGREE:
  - None substantive.
- ONE-SIDED:
  - Claude-only: explicit shipped commit reference retained in delta text.

### C-13 CAP-13 DOT inspection station geofence dwell tracking (major new feature)

- AGREE:
  - Both identify this as major, new, and high operational value.
  - Both require dedicated workflow, not just passive event storage.
  - AGREE source mapping (synthesized): Claude CAP-13 + Cursor CAP-13.
- DISAGREE:
  - Claude: proposes concrete station catalog schema, visit table schema, outcome enum, aging alerts, and fine auto-link windows.
  - Cursor: same capability/intent but intentionally leaves exact schema/threshold windows configurable pending arbitration.
  - Verbatim snippet (Claude): "CREATE TABLE catalogs.dot_inspection_stations ..."; "outcome_status ... ('unknown','no_action','warning_issued','fine_pending','fine_received','false_positive')"
  - Verbatim snippet (Cursor): "DOT station geofence dwell tracking workflow ... lock workflow contract now; finalize schemas and enum set..."
- ONE-SIDED:
  - Claude-only: explicit seed guidance (Texas corridors), outcome enum set, and auto-link rule window.

### C-14 CAP-14 practical/short/actual mileage three-way

- AGREE:
  - Both include as required extension.
  - AGREE source mapping (synthesized): Claude CAP-14 + Cursor CAP-14.
- DISAGREE:
  - Claude: ties practical/short to routing engine decision and billing/pay use split.
  - Cursor: same concept but kept at contract level, deferring engine lock and formula details.
  - Verbatim snippet (Claude): "miles_practical ... used for customer invoicing; miles_short ... used for driver pay..."
  - Verbatim snippet (Cursor): "reports expose three mileage bases with explicit reconciliation and variance reason codes."
- ONE-SIDED:
  - Claude-only: explicit engine decision framing (PC*MILER/Google/HERE).

### C-15 CAP-15 Samsara-driver <-> QBO-vendor integrity

- AGREE:
  - Both require unified integrity checks across existing invariants.
  - AGREE source mapping (synthesized): Claude CAP-15 + Cursor CAP-15.
- DISAGREE:
  - Claude: proposes concrete fields/findings taxonomy and daily worker semantics.
  - Cursor: defines integrity requirement with evidence trail expectations but not final schema.
  - Verbatim snippet (Claude): "CREATE TABLE safety.integrity_findings ... finding_type IN (...)"
  - Verbatim snippet (Cursor): "cross-system identity integrity checks must validate ... telematics driver identity maps to ... accounting identity."
- ONE-SIDED:
  - Claude-only: detailed finding taxonomy list and suggested integrity table shape.

### C-16 Architecture scope breadth

- AGREE:
  - Both add architecture for sovereignty + telematics expansion.
  - AGREE source mapping (synthesized): Claude Module 12/13 + Cursor Sections A/B.
- DISAGREE:
  - Claude architecture delta adds additional modules beyond direct CAP scope (QBO sync QE guardrails, routing engine module framing, webhook pattern formalization, old software reference-reading module).
  - Cursor independent architecture delta stayed intentionally narrower to requested capability and sovereignty core.
  - Verbatim snippet (Claude): "## Module 14 — QBO Sync Quality Engineering ..."; "## Module 16 — Webhook Architecture ..."
  - Verbatim snippet (Cursor): "This is an architecture contract draft, not a code patch."
- ONE-SIDED:
  - Claude-only: Module 14/15/16/17 expansion items.

### C-17 Operational milestones (PR #156, CPA packet, priority lock)

- AGREE:
  - Both treat as valid context.
  - AGREE source mapping (synthesized): Claude Change Report §2.1-2.3 + Cursor blueprint reconciled operational milestone section.
- DISAGREE:
  - Claude change report includes explicit milestone ledger entries and timestamps.
  - Cursor deltas focused primarily on spec/architecture content and did not replicate full operational report details.
  - Verbatim snippet (Claude): "## 2.1 — QBO sync health column-mismatch fix (PR #156)..."; "## 2.2 — BLOCK 20 ... packet sent"
  - Verbatim snippet (Cursor): "Operational Milestones (Reference-only, non-normative)"
- ONE-SIDED:
  - Claude-only: formal change-report artifact structure.

---

## Consolidated arbitration queue (Jorge decisions)

1. Do we adopt Claude's fully prescriptive blueprint-level defaults now (cadences, thresholds, radii, enums), or keep these in follow-up design docs while locking only invariant intent?
2. For CAP-3, confirm canonical replacement language and whether we include explicit historical correction note in final committed docs.
3. For CAP-13, confirm whether to lock concrete outcome enums, dwell thresholds, seed geography, and fine-link windows now.
4. Decide whether to include Claude Module 14/15/16/17 expansion in first commit or split into subsequent docs PR.
5. Confirm lock-now vs deferred-build tagging per CAP-1..CAP-15 for sequencing discipline.

---

## Follow-up task (non-blocking commit gate, same session target)

After approved delta docs are merged, refresh:

- `docs/specs/SAMSARA_CAPABILITY_MATRIX_2026-05-21.md`

Purpose: update pre-delta gap baseline to post-delta spec state.
