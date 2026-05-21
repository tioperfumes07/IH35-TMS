# Data Sovereignty + CAP Tracker (Cursor-side)

Date: 2026-05-21  
Scope: Post-merge status update after PR #157.

Rule applied per owner instruction:
- DS-* and CAP-* **design** rows -> `DONE`
- DS-* and CAP-* **build** rows -> `PENDING`

---

## Design status

| ID | Item | Status |
|---|---|---|
| DS-01 | Data sovereignty invariants in canonical blueprint/additions | DONE |
| DS-02 | Part numbering/insertion approach resolved | DONE |
| CAP-01 | CAP framework inclusion in canonical docs | DONE |
| CAP-02 | CAP-3 correction visibility in canonical wording | DONE |
| CAP-03 | CAP-5 taxonomy contract lock (thresholds deferred) | DONE |
| CAP-04 | CAP-13 contract lock (policy specifics deferred) | DONE |
| CAP-05 | CAP-14 engine-agnostic invariant lock | DONE |
| CAP-06 | CAP-15 invariant-level integrity lock | DONE |
| ARCH-DS-01 | Data sovereignty architecture boundary design | DONE |
| ARCH-DS-02 | Reconciliation architecture contract lock | DONE |
| ARCH-CAP-01 | Telematics event-family architecture contract | DONE |
| ARCH-CAP13-01 | CAP-13 locked schema shape (station + visit + enum) | DONE |
| ARCH-CAP13-02 | CAP-13 seed strategy deferred to implementation policy | DONE |
| ARCH-BEHAVIOR-01 | CAP-3/CAP-5 behavior contract lock (values deferred) | DONE |
| ARCH-MODEL-01 | Model-detail policy set (invariant-first, except CAP-13 lock) | DONE |
| ARCH-EXPAND-01 | Additional architecture modules deferred | DONE |

---

## Build status

| Stream | Status | Note |
|---|---|---|
| Data sovereignty implementation stream | PENDING | Queue/cadence/reconciliation implementation and runtime guards pending |
| CAP-1..CAP-15 implementation stream | PENDING | Capability buildout remains pending (spec now found for all 13 matrix capabilities) |
| CAP-13 implementation stream | PENDING | Locked schema shape available; migrations/routes/UI/workers pending |
