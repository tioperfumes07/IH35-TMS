-- ROUND 195 (owner order, 2026-09-28) — QuickBooks flags are BLOCKED PERMANENTLY, not merely off.
--
-- MEASURED LIVE before writing a line of this: lib.feature_flags has 92 active rows, 19 of them
-- QBO-named. Of those 19, 17 carry a per-entity lib.feature_flag_overrides row with enabled=false
-- for all three entities (TRANSP/TRK/USMCA), all set 2026-08-16 by the same owner user
-- (e4117991-d2c0-406d-8cda-74e98d95bccd) — nobody turned these off; they were pinned off at wiring
-- time and have never moved. The other 2 (QBO_RECONCILE_UI_ENABLED, TMS_QBO_RECON_UI_ENABLED) are
-- READ-ONLY reconciliation-surface UI flags — never post/write/move money, currently enabled=true
-- for all three entities, and stay OUT of the blocked list so that live, correct, read-only feature
-- keeps working.
--
-- The 17 blocked keys span two directions: 3 are the actual push/mirror-to-QBO "hard core" named by
-- the owner (QBO_JE_PUSH_ENABLED, QBO_ENTITY_PUSH_ENABLED, VOID_QBO_MIRROR_ENABLED — law doc §2,
-- "QuickBooks write-back: NEVER"); the other 14 are QBO-mirror-to-TMS pull/projection flags
-- (QBO_*_PROJECTION_ENABLED, QBO_*_MIRROR_PULL_ENABLED, QBO_MASTER_DATA_HEAL_ENABLED,
-- TMS_QBO_RECON_ENABLED). The owner's order covers all 19-2=17 without distinguishing direction, so
-- all 17 are blocked as ordered — recorded here so a future reader sees the real shape of the list,
-- not just its size.
--
-- HOW A FLAG ACTUALLY RESOLVES (apps/backend/src/lib/feature-flags/service.ts, resolveFlagEnabled):
-- every one of these 17 keys is already enumerated as a "per-entity-gated" flag (POSTING_FLAG_KEYS
-- or PER_ENTITY_ONLY_FLAG_KEYS) — which means lib.feature_flags.default_enabled/rollout_pct are
-- NEVER consulted for them at all; the ONLY path that can ever resolve one to true is a row in
-- lib.feature_flag_overrides with enabled=true. So the real enforcement surface is
-- lib.feature_flag_overrides. The trigger on lib.feature_flags below is true belt-and-suspenders
-- (per the owner's own explicit ask) against a future refactor that changes how these keys resolve
-- — it is not covering a live path today, and this migration says so rather than implying a risk
-- that the current code does not have.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS /
-- ON CONFLICT DO NOTHING for the seed rows.

BEGIN;

-- §1 — the named, auditable blocklist. A row is data, not code: it can be listed, diffed, and
-- audited without reading a migration. Unblocking a flag means DELETING its row here — an explicit,
-- logged act (whoever does it must say why in their own commit/PR) — never a code path, never a UI
-- toggle. No UPDATE path is provided on purpose: the table has no "active" boolean to flip. NO
-- GRANT for INSERT/UPDATE/DELETE to ih35_app below — the application role can only ever SELECT this
-- table, so "never a code path" is enforced twice over (grant boundary + trigger), not just by the
-- trigger alone.
CREATE TABLE IF NOT EXISTS catalogs.blocked_feature_flags (
  flag_key         text PRIMARY KEY,
  reason           text NOT NULL,
  owner_ruling_ref text NOT NULL,
  blocked_at       timestamptz NOT NULL DEFAULT now(),
  blocked_by_user_id uuid REFERENCES identity.users(id)
);

COMMENT ON TABLE catalogs.blocked_feature_flags IS
  'ROUND 195 (owner order, 2026-09-28): flag_keys here can never resolve to enabled, by trigger, '
  'regardless of who or what writes lib.feature_flag_overrides / lib.feature_flags. Unblocking = '
  'DELETE the row (explicit, logged, never a code path or UI toggle).';

ALTER TABLE catalogs.blocked_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_feature_flags_select ON catalogs.blocked_feature_flags;
CREATE POLICY blocked_feature_flags_select ON catalogs.blocked_feature_flags
  FOR SELECT TO ih35_app
  USING (true);

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT ON catalogs.blocked_feature_flags TO ih35_app;

-- §2 — the shared refusal, one function reused by both trigger sites (same shape as
-- accounting.refuse_financial_row_delete()). No current_user exemption: the owner's order is that
-- NO seat, script, or UI can ever set these true — that includes a coder or the owner running SQL
-- directly. The only sanctioned bypass is removing the blocklist row itself.
CREATE OR REPLACE FUNCTION lib.refuse_blocked_flag_enable()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  would_key   text;
  would_enable boolean;
  b           catalogs.blocked_feature_flags%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'feature_flag_overrides' THEN
    would_key := NEW.flag_key;
    would_enable := NEW.enabled;
  ELSIF TG_TABLE_NAME = 'feature_flags' THEN
    would_key := NEW.flag_key;
    -- Belt-and-suspenders only (see migration header): today's resolver never consults these two
    -- columns for a per-entity-gated flag, but a write that WOULD arm either one is refused anyway.
    would_enable := (COALESCE(NEW.default_enabled, false) IS TRUE) OR (COALESCE(NEW.rollout_pct, 0) > 0);
  ELSE
    RETURN NEW;
  END IF;

  IF would_enable IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT * INTO b FROM catalogs.blocked_feature_flags WHERE flag_key = would_key;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- RAISE EXCEPTION supports only bare '%' placeholders (not format()'s %L/%I) -- literal quotes
  -- are written directly around the final placeholder so the message stays copy-pasteable SQL.
  RAISE EXCEPTION
    'QBO_FLAG_PERMANENTLY_BLOCKED: % cannot be enabled. %. Ref: %. Blocked % by %. Unblocking requires DELETING catalogs.blocked_feature_flags WHERE flag_key = ''%'' — an explicit, logged act, never a code path or UI toggle.',
    would_key, b.reason, b.owner_ruling_ref, b.blocked_at, b.blocked_by_user_id, would_key
    USING ERRCODE = 'restrict_violation';
END
$fn$;

DROP TRIGGER IF EXISTS trg_refuse_blocked_flag_override ON lib.feature_flag_overrides;
CREATE TRIGGER trg_refuse_blocked_flag_override
  BEFORE INSERT OR UPDATE ON lib.feature_flag_overrides
  FOR EACH ROW EXECUTE FUNCTION lib.refuse_blocked_flag_enable();

DROP TRIGGER IF EXISTS trg_refuse_blocked_flag_default ON lib.feature_flags;
CREATE TRIGGER trg_refuse_blocked_flag_default
  BEFORE UPDATE ON lib.feature_flags
  FOR EACH ROW EXECUTE FUNCTION lib.refuse_blocked_flag_enable();

-- §3 — seed the 17 keys. owner_ruling_ref cites ROUND 195 for all; the 3 hard-core push/mirror
-- flags additionally cite the law doc's own write-back section, per the owner's explicit note.
-- ROUND 259 (Cursor): blocked_by_user_id is a real FK to identity.users(id). Fresh CI DBs have
-- no seed for owner uuid e4117991-…, so a bare UUID literal fails
-- blocked_feature_flags_blocked_by_user_id_fkey and reds main. Keep the FK (do NOT drop it);
-- resolve the user via scalar subquery so missing users seed NULL (column is nullable).
INSERT INTO catalogs.blocked_feature_flags (flag_key, reason, owner_ruling_ref, blocked_by_user_id)
VALUES
  ('QBO_JE_PUSH_ENABLED',
   'Push journal entries into QuickBooks. QBO write-back is the hard core the owner named.',
   'ROUND 195 (2026-09-28); law doc §2 "QuickBooks write-back: NEVER"',
   (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_ENTITY_PUSH_ENABLED',
   'Push invoice/bill/customer/vendor/account/item masterdata into QuickBooks. QBO write-back is the hard core the owner named.',
   'ROUND 195 (2026-09-28); law doc §2 "QuickBooks write-back: NEVER"',
   (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('VOID_QBO_MIRROR_ENABLED',
   'Mirror a TMS void into QuickBooks. QBO write-back is the hard core the owner named.',
   'ROUND 195 (2026-09-28); law doc §2 "QuickBooks write-back: NEVER"',
   (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AP_BILLS_PROJECTION_ENABLED',
   'Project the QBO A/P bills mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED',
   'Project the QBO A/P bill-payments mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED',
   'Pull QBO A/P bill payments into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AP_MIRROR_PULL_ENABLED',
   'Pull QBO A/P (purchases) into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AR_INVOICES_PROJECTION_ENABLED',
   'Project the QBO A/R invoices mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AR_INVOICE_MIRROR_PULL_ENABLED',
   'Pull QBO A/R invoices into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AR_PAYMENTS_PROJECTION_ENABLED',
   'Project the QBO A/R payments mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AR_PAYMENT_MIRROR_PULL_ENABLED',
   'Pull QBO A/R payments into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_EXPENSES_PROJECTION_ENABLED',
   'Project the QBO expenses mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_PURCHASES_MIRROR_PULL_ENABLED',
   'Pull QBO purchases into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_VENDOR_CREDITS_PROJECTION_ENABLED',
   'Project the QBO vendor-credits mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED',
   'Pull QBO vendor credits into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_MASTER_DATA_HEAL_ENABLED',
   'Auto-overwrite local vendor/customer/CoA fields from the QBO mirror (locked decision is detect-only).',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('TMS_QBO_RECON_ENABLED',
   'Twice-daily QBO<->TMS reconciliation pass (data-moving recon engine, distinct from its read-only UI flag).',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid))
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
