# GAP-52 — CAP-15 Driver ↔ QBO Vendor Mapping Integrity

Background drift detector for driver→QBO vendor mappings. Runs daily, persists to `safety.integrity_findings`, notifies Owner+Accounting on critical findings.

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main:
  - scripts/verify-driver-vendor-mapping-monitor.mjs
