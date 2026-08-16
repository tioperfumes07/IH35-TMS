-- ACCT-F5327 / LV-TRK-AP-SPLIT-ACROSS-TWO-ACTIVE-ACCOUNTS — TRK's `ap_control` role correctly
-- resolves to ONE account (TRK-2000) via `accounting.chart_of_accounts_roles` (the OTHER mapping,
-- to account "2000", already has `is_active = false` — the role-resolution layer is not ambiguous
-- and was never the defect). But account "2000" itself (id 3af15c76-0ef2-4433-a9a5-7eca44c2ce59) is
-- still `is_postable = true` and not deactivated, so an operator using a raw account picker
-- (bypassing the role resolver) can still manually select it and post there by mistake.
--
-- LIVE-VERIFIED THIS IS SAFE, NOT AN ACTIVE LEAK: account "2000" carries exactly 2 historical GL
-- lines, most recent 2026-07-29 — before the role mapping was switched to TRK-2000 (whose one
-- posting is dated 2026-08-03, after). No new postings have landed on "2000" since the switch; this
-- is legitimate imported/pre-fix history (imported-history-is-not-a-defect law), not a growing
-- problem. The fix here is narrow: stop a FUTURE accidental manual pick, do not touch the 2
-- existing historical lines (void-not-delete — nothing here deletes or reverses anything).
--
-- SCOPED TO TRK ONLY. The parallel USMCA case (damage_recovery / driver_payroll_clearing) was
-- triaged in the same pass and found to be the OPPOSITE shape — the role-mapping table's
-- `is_active=true` designee (accounts 6175 / 2170) has ZERO postings, while the "superseded"
-- accounts (5400 "Truck Repairs & Maintenance", DRIVERCASHAD896665 "Driver Cash Advance") are
-- carrying ALL the real, currently-active money (21 + 6 lines, most recent 2026-08-13 / 2026-08-11
-- — i.e. real, ongoing, CURRENT activity). Deactivating those USMCA accounts would break live,
-- working postings — the opposite of TRK's case. That is a real, still-open, higher-stakes question
-- (is the USMCA role-mapping table stale, or is something posting outside the role resolver
-- entirely?) that needs its own investigation before any account is touched; filed on the board,
-- deliberately NOT guessed at or copy-pasted from this migration's pattern.
--
-- IDEMPOTENT: UPDATE ... WHERE is_postable = true is naturally idempotent (a second run affects 0
-- rows). No DDL, no grant change, no destructive action.

BEGIN;

UPDATE catalogs.accounts
   SET is_postable = false,
       notes = COALESCE(notes || E'\n', '')
         || 'ACCT-F5327 (2026-08-16): marked non-postable — superseded ap_control target for TRK '
         || '(role mapping already points to TRK-2000 since 2026-07-29; this account''s last posting '
         || 'predates the switch). Historical postings left untouched — void-not-delete.',
       updated_at = now()
 WHERE id = '3af15c76-0ef2-4433-a9a5-7eca44c2ce59'::uuid
   AND operating_company_id = 'b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e'::uuid
   AND is_postable = true;

COMMIT;
