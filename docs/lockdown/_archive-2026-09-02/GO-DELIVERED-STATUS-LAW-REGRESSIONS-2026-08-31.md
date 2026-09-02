# GO — DELIVERED STATUS LAW REGRESSIONS (2026-08-31)

**NOT a new question.** The law exists. Four call sites ignore it.

## Canonical law (do not re-litigate)

`apps/backend/src/dispatch/delivery-evidence-status.ts`

- `DELIVERY_EVIDENCE_MDATA_STATUSES` = `delivered_pending_docs` · `completed_docs_received`
- `isDeliveryEvidenceStatus(status)` — product definition of **delivered**
- Header: *"Kept in ONE place so the driver paths and the office path cannot drift apart on what 'delivered' means."*

Recognition trigger locked: `docs/lockdown/DISPATCH-STATUS-STOP-COUPLING-SCOPE-2026-08-01.md` §0(a) — final active delivery-stop completion / `actual_departure_at`.

State machine: `apps/backend/src/dispatch/load-state-machine.ts` (`allowedTransitions`).

## What the product writes

- `driver/loads.routes.ts:660` · `driver-pwa/dispatch-view.routes.ts:471` → `delivered_pending_docs`
- Nothing writes bare `delivered` today

**Live USMCA (2026-08-31):** `delivered_pending_docs` 13 · `completed_docs_received` 5 · bare `delivered` 1  
→ **19 loads** are delivered under the law. Legacy filter returned **1**.

## FINDING: DELIVERY-EVIDENCE-STATUS-REGRESSION (P1)

| ID | Site | Was | Fix |
|----|------|-----|-----|
| R1 | `dispatch/factoring-queue.routes.ts` | `IN ('delivered','invoiced','paid','closed')` | `FACTORING_PATH_LOAD_MDATA_STATUSES` |
| R2 | `factoring/packet-assemble.service.ts` | same legacy set (×2) | `isFactoringPathLoadStatus` / exported list |
| R3 | `expense-attribution/attribute.service.ts` | same legacy set | `isDeliveryEvidenceStatus` / exported list |
| R4 | `accounting/invoice-render.routes.ts:304` | `String(status).includes("delivered")` | `isDeliveryEvidenceStatus` |
| R5 | `stamp-final-delivery-departure.ts` | local duplicate set | import leaf module |

R1–R3 = why loads do not reach factoring (queue reads 1 of 19).  
R4 = substring on enum — correct today **by accident** (`delivered_pending_docs` contains the word).

## CC-1 P0 reclassify

VOID `DISPATCH-NO-UI-DELIVERED-TRANSITION`. UI writes `delivered_pending_docs` correctly.  
Rename defect → **`DISPATCH-LEGACY-DELIVERED-FILTER-REGRESSION`**. Not a missing control.

## Guard

`scripts/verify-delivered-status-single-source.mjs`

- FAIL: inline legacy cohort A, re-declared `DELIVERY_EVIDENCE_*`, status substring / `LIKE '%deliver%'`
- Exempt: `load-state-machine.ts` (enumerates full enum for transitions)
- Selftest plants one violation per class

## Seat assignment

| Seat | Scope |
|------|--------|
| **CC-3** | R1, R4, R5 import, guard + verify-step |
| **CC-1** | R2, R3 · reclassify P0 |
| **CC-2** | Re-bind DISP-TIEOUT-01 to `isDeliveryEvidenceStatus`; re-grade; report old vs new counts (expected value unchanged) |

No owner ruling pending. Import the predicate. Ship the guard.
