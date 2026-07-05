# Settlement/Deduction Engine — DEFINITIVE TRACE (resolves M-RECONCILE-NOTE)
2026-07-04 · read-only live-code trace to settle the contradictory audit findings BEFORE any Repair-A change.
DESIGN/ANALYSIS DOC — no code changed. Financial-cluster: never self-merge; owner sign-off required.

## The contradiction
Some agents: the schema-correct applier is test-only + the payroll engine is orphaned.
Other agent: there are two LIVE appliers + payroll posts real Bills unconditionally.

## Verdict — BOTH partly right; there are TWO live engines
1. `driver_finance.*` — canonical per the UI + FIN-18 GL poster (`settlement-posting.service` reads
   `driver_settlement_deductions WHERE applied_to_settlement_id`). Its live close path
   (`settlements-load-bookended.service.ts` → `aggregateSettlementTotals`, line 161/303) calls **NO deduction
   applier** → deductions never apply → drivers overpaid. (Agent 1 correct.)
2. `payroll.*` — **LIVE-ROUTED**: `apps/backend/src/index.ts:438` registers
   `registerPayrollDriverSettlementRoutes` → `POST /api/v1/payroll/driver-settlements/compute` +
   `/:settlement_id/post`. The `/post` path calls `createBill` + `payBill` (driver-settlement.service.ts
   ~447/460) → posts REAL Bills + Payments. Its recovery-math is gated by a **RAW** read
   `SELECT default_enabled FROM lib.feature_flags WHERE flag_key='SETTLEMENT_CAPPED_RECOVERY_ENABLED'`
   (line 122-125) — bypasses `isEnabled`/per-entity/kill-switch (this IS finding H3-4). (Agent 2 correct.)
3. `applyPendingDeductionsToSettlementWithNetFloor` (settlement-deduction-cap.service.ts:159) — the only
   schema-correct applier — has **no non-test caller**. `abandonment.service.ts:357` stamps
   `applied_to_settlement_id` directly (its own path). So deduction application is scattered across 3
   unwired/partial paths, none unified.

## Consequence for Repair A (per owner-locked decisions [[audit-fix-decisions-2026-07-04]])
- Canonical store = `driver_finance.driver_settlement_deductions` (decision B). ✅
- Wire an applier into the `driver_finance` LIVE close (before `aggregateSettlementTotals`), stamping
  `applied_to_settlement_id` for ALL deduction types, enforcing the **5% editable** floor (decision C) with
  an Accept/Edit-amount step, recovering **pay-first-then-escrow** (decision D).
- Retire / bridge the `payroll.*` engine so there is ONE settlement money path (ties to E1-4 / C1-1);
  route its `SETTLEMENT_CAPPED_RECOVERY_ENABLED` read through the resolver (H3-4).
- No consent-template build (decision F — hire contract authorizes).

## Status
Trace COMPLETE. Repair A design proceeds on this map. NO settlement code touched until owner sign-off.
