# GAP-19 — Detention Billable Manager-Approval Gate

## Summary

Adds a **manager approval gate** on top of the existing dispatch detention
accrual board (`dispatch.detention_events`, `bridgeDetentionToBilling`) so that
accrued detention is only billed after explicit Manager+ approval. Approval
reuses the existing billing path and records discrete dwell evidence.

This block is **additive** and reuses existing detection, board, and bridge
infrastructure (decision 6-2-A). No new detection or accrual logic is
introduced.

## Billing model (important)

`bridgeDetentionToBilling()` **merges** the accrued detention amount into the
load's `rate_total_cents`. `buildInvoiceFromLoad()` then emits a single
`linehaul` invoice line from that total. Therefore **detention is folded into
the linehaul invoice total** today.

> NOTE: a discrete detention line on the customer invoice is a follow-up block
> needing separate authorization. It is intentionally **not** built here.

## Flow

1. The accrual board closes a detention event (`status = 'closed'`) with an
   accrued amount.
2. Listing the approval queue (or KPIs) idempotently syncs a
   `dispatch.detention_requests` row (`status = 'pending_review'`) per closed,
   billable event.
3. A Manager+ user approves or rejects:
   - **Approve** → `bridgeDetentionToBilling()` (merges into `rate_total_cents`)
     → `buildInvoiceFromLoad()` (emits/refreshes the linehaul invoice) →
     records a `dispatch.detention_evidence` row → request marked `invoiced`.
   - **Reject** → request marked `rejected` with a required reason; audited.

## Schema

- `dispatch.detention_requests` — approval queue (one row per detention event).
- `dispatch.detention_evidence` — dwell evidence captured at approval
  (discrete table, **not** JSONB on `invoice_lines`, decision 6-5-A).

Both migrations carry a self-contained GRANT block (schema USAGE + object grants
+ sequence grants + default privileges) and company-scoped RLS, matching the
PREREQ-A schema-grant gate.

## Evidence derivation

- Arrival/departure timestamps are **derived from stop timestamps**
  (`dispatch.stop_arrivals` → `mdata.load_stops`) and labeled
  `evidence_source = 'derived_from_stop_timestamps'` (decision 6-6-A).
- The unit is resolved to its Samsara vehicle id via the integrations
  projection join `integrations.samsara_vehicles.local_unit_id = unit_id`
  (decision 6-7-A).

## Routes

| Method | Path | RBAC |
|--------|------|------|
| GET | `/api/v1/dispatch/detention/requests` | authenticated |
| GET | `/api/v1/dispatch/detention/requests/kpis` | authenticated |
| PATCH | `/api/v1/dispatch/detention/requests/:id/approve` | Manager+ |
| PATCH | `/api/v1/dispatch/detention/requests/:id/reject` | Manager+ |

## Frontend

`DetentionBoardPage` is extended with a KPI header (Pending / Approved this week
$ / Approved YTD $) and a manager **Approval queue** table with approve/reject
controls (decision 6-3-A).

## Sources

- WF-053 multi-stop extra_rate consolidation
- GAP-32 customer free-time catalog (per-customer thresholds)
- B21-D5 detention accrual board + billing bridge
