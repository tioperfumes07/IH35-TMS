-- FLAG-SPLIT-BRAIN sweep — register the read-only finance-surface UI feature flags (default OFF).
--
-- Three READ-ONLY finance surfaces gated their backend on process.env.<X>_UI_ENABLED while their
-- frontend gated the SAME surface via the lib.feature_flags flag of the same name (through
-- useFeatureFlag -> /api/feature-flags/check -> isEnabled). With no DB row seeded, the two sides
-- could disagree (split-brain: UI shows the surface while the backend 404s, or vice versa). The
-- backend routes now resolve these exact flags via isEnabled(client, '<flag>', {opco,user}), the SAME
-- source + resolver the frontend uses, so backend and UI stay in lockstep. This migration seeds the
-- SINGLE canonical row both sides now read.
--
-- Surfaces:
--   AR_AP_AGING_UI_ENABLED        — FIN-20 AR/AP aging report (fin20-aging.routes.ts).
--   QBO_RECONCILE_UI_ENABLED      — FIN-23 QBO reconcile / modify-captures (qbo-reconcile-captures.routes.ts).
--   FINANCE_BREAK_EVEN_UI_ENABLED — F1 Break-Even analysis (break-even.routes.ts).
--
-- Each is registered in PER_ENTITY_ONLY_FLAG_KEYS (service.ts) so a global default_enabled/rollout_pct
-- can never turn it on — enable is an explicit per-entity (operating_company_id) override, an owner
-- (Jorge) sign-off. All three are READ-ONLY (they only SELECT; never post/write/move money).
--
-- Default OFF: this migration DOES NOT enable any surface. It only makes both sides read one source of
-- truth. Additive, idempotent (ON CONFLICT DO NOTHING) — safe to re-run; never flips an existing row.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('AR_AP_AGING_UI_ENABLED',
   'FIN-20 AR/AP aging read-only report. Per-entity-only (owner-flipped via override); never posts/writes. Default OFF.',
   false),
  ('QBO_RECONCILE_UI_ENABLED',
   'FIN-23 QBO reconcile / modify-captures read-only surfacing. Per-entity-only (owner-flipped via override); never posts/writes. Default OFF.',
   false),
  ('FINANCE_BREAK_EVEN_UI_ENABLED',
   'F1 Break-Even read-only analysis inputs. Per-entity-only (owner-flipped via override); never posts/writes. Default OFF.',
   false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK:
--   DELETE FROM lib.feature_flags WHERE flag_key IN
--     ('AR_AP_AGING_UI_ENABLED','QBO_RECONCILE_UI_ENABLED','FINANCE_BREAK_EVEN_UI_ENABLED');
