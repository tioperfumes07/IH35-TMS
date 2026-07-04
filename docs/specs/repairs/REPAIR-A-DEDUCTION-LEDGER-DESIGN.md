# REPAIR A — Unify the deduction ledger + wire the applier (DESIGN)
2026-07-04 · financial-cluster §1.4 · DESIGN DOC — no code/SQL applied. Ships behind an OFF flag on a Neon
test branch; **owner (Jorge) sign-off is the gate** (CPA decisions already locked — see
`[[audit-fix-decisions-2026-07-04]]`). Grounded in `SETTLEMENT-ENGINE-TRACE-2026-07-04.md`.

## Problem (traced, definitive)
Two live settlement engines. `driver_finance.*` (canonical UI + FIN-18 poster) whose live close
(`settlements-load-bookended.service.ts` → `aggregateSettlementTotals`) applies **no deductions** → drivers
overpaid. `payroll.*` (live-routed `/api/v1/payroll/driver-settlements/*`) posts real Bills via a raw-read
`SETTLEMENT_CAPPED_RECOVERY_ENABLED` flag (finding H3-4). The schema-correct applier
`applyPendingDeductionsToSettlementWithNetFloor` has no prod caller; `abandonment.service` stamps directly.

## Design (owner-locked)
1. **Canonical ledger** = `driver_finance.driver_settlement_deductions` (cents). All producers
   (recover-from-driver, escrow-pending, cash-advance, abandonment) write here with `applied_to_settlement_id`.
   `settlement_lines` deduction rows become a derived mirror; the `payroll.*` deduction path is retired.
2. **Wire the applier into the LIVE close** (`driver_finance` finalize, before `aggregateSettlementTotals`):
   stamp `applied_to_settlement_id` for every pending deduction of every type, then recompute
   `deductions_total` from the canonical ledger so the FIN-18 tie-out passes.
3. **Net-pay floor = 5% default, EDITABLE** (decision C): one floor resolver, one config source, default
   5%. The settlement UI shows an **Accept / Edit-amount** control per deduction; a terminal settlement may
   override the floor down to the full final check.
4. **Recovery ordering = PAY FIRST, then escrow** (decision D): the applier deducts from settlement pay
   first; only the shortfall draws escrow (debit Driver Escrow liability). Escrow keeps growing as a buffer.
   Rework migration-0094's walkoff trigger to pay-first, SINGLE charge (kills the chargeback+escrow double).
5. **No consent build** (decision F): the `driver_deduction_auth` gate is satisfied by the signed hire
   contract — no driver e-sign flow (see Repair B design).
6. **Collapse to one engine**: retire/bridge `payroll.*` so there is ONE settlement money path (E1-4/C1-1);
   route its `SETTLEMENT_CAPPED_RECOVERY_ENABLED` read through `isEnabled(...opco...)` (H3-4).

## Draft SQL (NOT applied — proof only)
```sql
-- referential guardrail (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_dsd_applied_settlement') THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD CONSTRAINT fk_dsd_applied_settlement
      FOREIGN KEY (applied_to_settlement_id) REFERENCES driver_finance.driver_settlements(id);
  END IF;
END $$;
-- flag-every-divergence tie-out (security_invoker=true on the real object)
CREATE OR REPLACE VIEW driver_finance.v_settlement_deduction_tieout AS
  SELECT s.id AS settlement_id, s.operating_company_id,
         s.deductions_total_cents AS header_total,
         COALESCE(SUM(d.amount_cents),0) AS ledger_total,
         s.deductions_total_cents - COALESCE(SUM(d.amount_cents),0) AS variance_cents
  FROM driver_finance.driver_settlements s
  LEFT JOIN driver_finance.driver_settlement_deductions d ON d.applied_to_settlement_id = s.id
  GROUP BY s.id;
```

## CI guards
- `verify-deduction-applier-has-prod-caller` — fail if the applier is only referenced by tests.
- poster-contract test — a live settlement with a bucketed deduction posts balanced (no CONSENT/INCONSISTENT throw).
- `verify-no-null-applied-settlement-on-close` — close leaves no pending deduction unstamped.
- `verify-single-settlement-engine` — no second engine posts settlement Bills.
- floor test — cap and FIN-18 floor read the same 5% source; the edit-amount override is respected.

## Rollout
Neon test branch: seed a settlement per deduction_type, run close, assert tie-out variance=0, pay-first
ordering, 5% floor + override, and a balanced JE. Ship behind `SETTLEMENT_GL_POSTING_ENABLED` (to be flipped
OFF until this lands). Owner sign-off before merge; verify in staging before the flag flip.
