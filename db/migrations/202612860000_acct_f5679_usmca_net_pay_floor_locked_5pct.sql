-- ACCT-F5679 — corrects USMCA's settlement net-pay floor from a stale DB-column default to the
-- owner-LOCKED value. 00_LOCKED_DECISIONS.md Section 9.2 fixes the net-pay floor at 5% default
-- (editable per settlement, via Accept/Edit) — but org.companies.min_net_settlement_pct's own
-- column DEFAULT (migration 202606071910) is 50, and nothing has ever explicitly overridden it.
--
-- settlement-deduction-cap.service.ts's OWN comment already documents this exact gap:
-- "The matching DB-column DEFAULT (mdata.drivers / org.companies min_net_settlement_pct,
-- migration 202606071910 DEFAULT 50) is a Jorge-gated follow-up migration ... NOT edited here."
-- The service's code-level DEFAULT_MIN_NET_PCT constant was already corrected to 5 — but a
-- company row with an explicit (if stale-defaulted) value always wins over that code default in
-- resolveSettlementMinNet's per-driver -> per-company -> env chain, so USMCA's real settlements
-- compute against 50%, not the locked 5%.
--
-- Discovered live while proving ACCT-F5678's settlement-close fix end-to-end: S-2026-0002
-- correctly BLOCKED on NET_PAY_FLOOR_BREACH, computed against the wrong 50% floor
-- (floor_cents=14880 on gross=29760; at the correct 5% floor that would be 1488).
--
-- SCOPE: USMCA ONLY, per standing directive (TRANSP/TRK parked). Idempotent — only updates the
-- row currently at the stale 50, never overwrites an explicit non-default value someone may have
-- deliberately set later.

BEGIN;

UPDATE org.companies
SET min_net_settlement_pct = 5,
    updated_at = now()
WHERE id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid -- USMCA
  AND min_net_settlement_pct = 50;

COMMIT;
