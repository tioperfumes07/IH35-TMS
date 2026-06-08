# DEEP-AUDIT-C — End-to-End QBO Workflows

**Block:** CLOSURE-16-DEEP-AUDIT-C (Lane B)  
**Date:** 2026-06-08 (CST / Laredo)  
**Auditor:** Agent B (audit-only)  
**CI guards:** `verify:deep-audit-c-workflow-*`

## Workflow 1 — WO → Bill → QBO → Bank rec

| Step | Surface | API / action | Result |
|------|---------|--------------|--------|
| 1 | `/maintenance` → Repair WO | `POST /api/v1/maintenance/work-orders` | WO created with Section A + B lines |
| 2 | Save & Create Bill | `autoCreateBillFromWO` in `wo-integration.ts` | Bill in `/accounting/bills` |
| 3 | QBO post | Outbox `qbo.bill.create` | AP account + class on QBO bill |
| 4 | Bill Payment | `BillPaymentModal` (AUDIT-FIX-16) | `POST /api/v1/accounting/bill-payments` |
| 5 | QBO payment | Outbox `qbo.billpayment.create` | Bank account credited |
| 6 | Bank rec | Plaid feed vs `accounting.reconciliation` | Match row |

**Spot-check:** Bill total = WO Section B sum within 1¢.  
**Finding C-WF1-1 (MEDIUM):** Road-service quick path bypasses Section B catalog autocomplete when parts typed free-form.  
**Finding C-WF1-2 (LOW):** Reconcile UI does not auto-suggest bill payment reference.

## Workflow 2 — Load → Invoice → Factored → Settled

| Step | Surface | API / action | Result |
|------|---------|--------------|--------|
| 1 | `/dispatch` book wizard | `POST /api/v1/dispatch/loads` | Load booked |
| 2 | Assign driver + unit | assignment quicksave | Driver on load |
| 3 | Delivered | status transition | Ready to invoice |
| 4 | Create invoice | load → invoice (AF-16) | Invoice + QBO AR |
| 5 | Faro CSV | `/factoring/faro-import` (AF-17) | Invoice in factor file |
| 6 | Receive payment | `/accounting/payments` | Cash + escrow updated |
| 7 | Settlement | payroll batch | `driver_settlements` row |

**Spot-check:** Settlement net = load rate × split % for team loads.  
**Finding C-WF2-1 (HIGH):** Team-split secondary driver line sometimes missing on settlement summary report (ties C-RPT-1).  
**Finding C-WF2-2 (MEDIUM):** Faro import requires manual column map if invoice # format drifts.

## Workflow 3 — Settlement → Payroll Integration

| Step | Surface | API / action | Result |
|------|---------|--------------|--------|
| 1 | Batch settlements | `POST /api/v1/payroll/settlements/batch` | N driver rows |
| 2 | QBO Payroll period | Intuit payslips API | W-2 totals |
| 3 | `/payroll-integration` | `GET /api/v1/payroll-integration/aggregate` | Unified labor view |
| 4 | Class allocation | `UNIT-DRIVER` vs `OFFICE` | Per-class bar chart |
| 5 | Export PDF/CSV | page actions | Owner review packet |

**Status:** Workflow 3 **blocked on main** — CLOSURE-12 shipped manifest-only (#563); aggregate page not yet present.  
**Finding C-WF3-1 (CRITICAL):** `/payroll-integration` route and aggregate API absent — full CLOSURE-12 implementation required before this workflow can pass live.  
**Finding C-WF3-2 (HIGH):** CI guard `verify-payroll-aggregate-matches-qbo` not wired.

## Severity summary (workflows)

| ID | Severity | Workflow |
|----|----------|----------|
| C-WF3-1 | CRITICAL | 3 — payroll integration page missing |
| C-WF2-1 | HIGH | 2 — team-split settlement summary |
| C-WF3-2 | HIGH | 3 — aggregate CI guard missing |
| C-WF1-1 | MEDIUM | 1 — free-form parts on road service |
| C-WF2-2 | MEDIUM | 2 — Faro column drift |
| C-WF1-2 | LOW | 1 — reconcile auto-suggest |
