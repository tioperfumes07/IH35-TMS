# AUTO-03 — Work Order create modal: VERIFY (already built)

**Verdict: already built — no build needed.** The "+ Create Work Order" button is **not** dead.

## Evidence (repo, 2026-06-20)
- `apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx` — **398 lines, fully functional**:
  uses `createWorkOrder` (the POST), `suggestExpenseLoad`, a full form with **G18 load-exemption validation**,
  payment-timing options, and submit handlers (`submit("wo_only")`, etc.).
- Route `/maintenance/work-orders/new` → `WorkOrderNewPage.tsx` → renders `<CreateWorkOrderModal>`.
- The `+ Create Work Order` controls reach it:
  - `components/vehicle-profile/ActionBar.tsx` → `href="/maintenance/work-orders/new?unit_id=…"`
  - `pages/maintenance/components/QuickActionsBar.tsx` → opens a WO-type menu
  - `pages/maintenance/DefectDetailPage.tsx`, `ConvertIssueToWOModal.tsx`

## Fence
The create-WO **posting path is already present and wired** (`createWorkOrder` → can cascade to AP). That is the
Tier-1 fenced part — left **untouched** by this verify. No posting was enabled or changed.

## Action
None required. Recorded as a verify finding (mirrors the prior reconciliation discipline: do not rebuild what exists).
GUARD walks the live modal to confirm pickers populate on the real layout.
