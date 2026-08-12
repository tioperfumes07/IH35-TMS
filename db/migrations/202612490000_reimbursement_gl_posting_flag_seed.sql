-- LV-REIMBURSEMENT-FLAG-NEVER-SEEDED — seed 3 backend-referenced flags that were never inserted into
-- lib.feature_flags. All 3 were found by the SAME static scan (scripts/verify-flag-keys-seeded.mjs,
-- shipped alongside this migration): every flag key `isEnabled()` reads in apps/backend/src, diffed
-- against the live table.
--
-- lib/feature-flags/service.ts:322 short-circuits `if (!flag) return false` BEFORE any per-entity
-- override is even consulted, so an unseeded key is not "off, flip it when ready" — there is NO ROW
-- TO FLIP and no override can ever turn it on.
--
-- (1) REIMBURSEMENT_GL_POSTING_ENABLED — driver-reimbursement.service.ts. THE ORIGINAL FINDING:
--     live-proven on prod 2026-08-07 that a paid driver reimbursement (edc714ed-…, $75.00, USMCA)
--     posted with journal_entry_id NULL, permanently unpostable, for every entity, silently — the
--     service itself is honest (`posted:false`), the flag was just never a flippable switch.
-- (2) INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE — invoice-send.service.ts (ACCT-F61/LV-012). The
--     author's own comment already names this exact gap ("...one is seeded — no migration in this
--     PR") — a deliberate, documented deferral, not a silent accident. Behavior is UNCHANGED by
--     seeding it: isEnabled() already returns false either way; this only makes the switch flippable.
-- (3) CASH_FOLLOWS_ETA_ENABLED — predicted-delivery.routes.ts / cash-flow.routes.ts. Same shape —
--     the route's own comment says "isEnabled returns false while the flag is unregistered, so the
--     endpoint no-ops until Jorge turns it on" — also a deliberate deferral. Forecast/scheduling only
--     (never touches a posted invoice / AR / settlement / QBO), so the lowest-risk of the three.
--
-- All 3 seed default_enabled=false (flags-default-OFF law). No entity is opted in by this migration —
-- per-entity flips are a separate, deliberate lib.feature_flag_overrides write, same as every other
-- posting flag in this codebase (see 202612110000 for the identical pattern).
--
-- Additive · idempotent · no money moves · posts no GL · seeds no override.

BEGIN;

-- lib.feature_flags is RLS-protected and the runtime role is not a member of any entity for a global
-- flag row, so a plain INSERT raises "new row violates row-level security policy". The bypass branch
-- is the sanctioned path for migration-time master data (same as 202611250000 / 202611260000 / 202612110000).
SET LOCAL app.bypass_rls = 'lucia';

INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES
  (
    'REIMBURSEMENT_GL_POSTING_ENABLED',
    'Per-entity kill switch read by driver-reimbursement.service.ts to post a balanced JE (Dr expense / Cr cash-or-payable) when a driver reimbursement is paid. Reuses the existing posting engine — no hand-written JE. Strict no-op while OFF: the reimbursement still marks paid, GL posting is simply skipped. Per-entity overrides only; OFF until the owner opts an entity in.',
    false,
    0
  ),
  (
    'INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE',
    'Per-entity kill switch read by invoice-send.service.ts (ACCT-F61/LV-012). When ON, sending an invoice with no delivery evidence on its final active delivery stop (or no source_load_id at all) is refused rather than merely warned. Reuses the same finalActiveDeliveryDepartureAt the revenue latch reads — never a second copy of the evidence rule. OFF (this migration) preserves today''s WARN-only behavior exactly; seeding does not change output, it only makes the switch flippable.',
    false,
    0
  ),
  (
    'CASH_FOLLOWS_ETA_ENABLED',
    'Per-entity kill switch read by predicted-delivery.routes.ts / cash-flow.routes.ts (PROJECTED-CASH-FOLLOWS-ETA, Phase 7 Block 2). When ON, cash-flow projections bucket a load''s expected income by its predicted (ETA-driven) delivery date instead of the default date. Forecast/scheduling only — never touches a posted invoice, AR, settlement, or QBO. OFF (this migration) preserves today''s no-op behavior exactly; seeding does not change output, it only makes the switch flippable.',
    false,
    0
  )
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
