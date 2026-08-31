# DELIVERY EVIDENCE STATUS — REGRESSION LAW (2026-08-31)

**Not ambiguous. Not a new owner question.** Canonical source already exists.

## Single source of truth

`apps/backend/src/dispatch/delivery-evidence-status.ts`

- `DELIVERY_EVIDENCE_MDATA_STATUSES` = `delivered_pending_docs` · `completed_docs_received`
- `isDeliveryEvidenceStatus(status)` — the product definition of **delivered**
- Recognition trigger locked: `docs/lockdown/DISPATCH-STATUS-STOP-COUPLING-SCOPE-2026-08-01.md` §0(a)

State machine: `apps/backend/src/dispatch/load-state-machine.ts` (`allowedTransitions`).

## FINDING: DELIVERY-EVIDENCE-STATUS-REGRESSION (P1)

**Four call sites inlined legacy cohort A** (`delivered`/`invoiced`/`paid`/`closed` or substring `includes("delivered")`) instead of importing the leaf module — factoring queue saw **1** load while **19** were at delivery evidence.

| Site | Was | Fix |
|------|-----|-----|
| `factoring-queue.routes.ts` | legacy IN list | `FACTORING_PATH_LOAD_MDATA_STATUSES` |
| `packet-assemble.service.ts:132,:309` | legacy set / IN | `isFactoringPathLoadStatus` / exported list |
| `expense-attribution/attribute.service.ts` | legacy set / IN | `isDeliveryEvidenceStatus` / exported list |
| `invoice-render.routes.ts:304` | `includes("delivered")` | `isDeliveryEvidenceStatus` |

**Fifth drift:** `stamp-final-delivery-departure.ts` duplicated the set — must import leaf module.

## Guard

`scripts/verify-no-inline-delivered-status-list.mjs` — no module may inline delivered-status lists; import `delivery-evidence-status.ts`.

## CC-1 reframe

VOID P0 `DISPATCH-NO-UI-DELIVERED-TRANSITION`. UI writes `delivered_pending_docs`. Defect = **regressions against this file**, not missing control.

## CC-2

Re-run DISP-TIEOUT-01 with canonical cohort. Report OBSERVED pass/fail. Faro face $95,075.00 unchanged.
