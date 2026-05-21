# IH35-TMS Samsara Capability Matrix (Post-Delta Refresh)

Date: 2026-05-21  
Author: Cursor  
Scope: Post-merge refresh after PR #157 (data sovereignty + telematics deltas merged).

Status key:
- Spec status: `found in spec` | `partially in spec` | `not in spec`
- Code status: `full code` | `stub code` | `no code`

Canonical source references for this refresh:
- `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` (Section 15, Part 14/15 additions)
- `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` (2026-05-21 addendum)

---

## 1) Automatic geofence creation on every dispatch (pickup + delivery + fuel stop points)

- Spec status: `found in spec`
- Code status: `stub code`
- Gap note: canonical contract is now explicit; implementation remains partial.

## 2) Driver auto-status switch when vehicle moves without app input

- Spec status: `found in spec`
- Code status: `no code`
- Gap note: contract now explicit; no clear implementation path present yet.

## 3) 250-foot arrival prompt correction (formerly described as 250-mile/25-mile)

- Spec status: `found in spec`
- Code status: `no code`
- Gap note: correction is now explicit in canonical docs; code alignment remains pending.

## 4) HOS-driven fuel stop calculation in fuel planner

- Spec status: `found in spec`
- Code status: `stub code`
- Gap note: spec now locked as capability contract; production-grade algorithm still pending.

## 5) Engine diagnostic fault -> auto work order creation

- Spec status: `found in spec`
- Code status: `no code`
- Gap note: invariant now explicit; implementation remains pending.

## 6) Driver scoring page in safety module

- Spec status: `found in spec`
- Code status: `no code`
- Gap note: now canonically in-scope; no implemented surface found yet.

## 7) Dashcam integration with safety/incidents

- Spec status: `found in spec`
- Code status: `no code`
- Gap note: now canonically in-scope; no implemented integration found yet.

## 8) State DOT inspection station geofence dwell tracking

- Spec status: `found in spec`
- Code status: `no code`
- Gap note: canonical workflow and locked schema shape now exist; implementation pending.

## 9) Practical / short / actual mileage three-way comparison reports

- Spec status: `found in spec`
- Code status: `stub code`
- Gap note: canonical contract exists; end-to-end report implementation pending.

## 10) Samsara driver -> QBO vendor mapping integrity

- Spec status: `found in spec`
- Code status: `stub code`
- Gap note: invariant now explicit; integrity checker implementation pending.

## 11) Dispatch board "on track / behind / delayed" computed from GPS vs planned route

- Spec status: `found in spec`
- Code status: `stub code`
- Gap note: taxonomy is now explicit in spec; calculation/policy values remain implementation-managed.

## 12) Maintenance prediction from live odometer + engine hours

- Spec status: `found in spec`
- Code status: `stub code`
- Gap note: contract now explicit; engine-hours integration remains pending.

## 13) Vehicle-driver pairing-at-time-of-event for accident/WO attribution

- Spec status: `found in spec`
- Code status: `stub code`
- Gap note: generalized event-time invariant now explicit; full implementation pending.

---

## Summary

- Pre-delta status: mixed (`not in spec`/`partially in spec`/`found in spec`)
- Post-delta status: all 13 capabilities are now `found in spec`
- Build status: unchanged by docs-only merge (implementation work remains open)
