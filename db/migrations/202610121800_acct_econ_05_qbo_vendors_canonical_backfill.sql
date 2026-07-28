-- HOLD-FOR-JORGE — FINANCIAL CLUSTER · ACCT-ECON-05
-- DO NOT RUN ON PROD — owner Neon-applies by hand, then ledger-backfill; registered in
-- db/migrations/.held-migrations.json (verify:hold-migrations-registered).
-- Backfill residual QBO vendor masters from RETIRE mdata.qbo_vendors → canonical
-- accounting.qbo_vendors (additive only; NEVER DROP retire table).
-- Cursor migration lane band HH 12–23 UTC (#3703): 202610121800.
-- Idempotent: INSERT … WHERE NOT EXISTS on (operating_company_id, qbo_id) when qbo_id present,
-- else (operating_company_id, id). Dynamic org.companies — no hardcoded UUIDs.

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.qbo_vendors') IS NULL OR to_regclass('mdata.qbo_vendors') IS NULL THEN
    RAISE NOTICE 'ACCT-ECON-05 backfill skipped — required relations missing';
    RETURN;
  END IF;

  -- Prefer match on qbo_id when present (stable remote identity).
  INSERT INTO accounting.qbo_vendors (
    id,
    operating_company_id,
    qbo_id,
    display_name,
    company_name,
    primary_email,
    primary_phone,
    active,
    payload_json,
    raw_payload,
    mirrored_at,
    last_seen_at,
    created_at,
    updated_at,
    created_in_tms,
    qbo_sync_token,
    qbo_updated_at,
    sync_status,
    qbo_push_attempts,
    eligible_1099,
    payment_terms_qbo_id,
    default_ap_account_qbo_id
  )
  SELECT
    m.id,
    m.operating_company_id,
    m.qbo_id,
    m.display_name,
    m.company_name,
    m.primary_email,
    m.primary_phone,
    COALESCE(m.active, true),
    m.payload_json,
    m.raw_payload,
    m.mirrored_at,
    m.last_seen_at,
    COALESCE(m.created_at, now()),
    COALESCE(m.updated_at, now()),
    COALESCE(m.created_in_tms, false),
    m.qbo_sync_token,
    m.qbo_updated_at,
    COALESCE(m.sync_status, CASE WHEN m.qbo_id IS NOT NULL THEN 'synced' ELSE 'unsynced' END),
    COALESCE(m.qbo_push_attempts, 0),
    COALESCE(m.eligible_1099, false),
    m.payment_terms_qbo_id,
    m.default_ap_account_qbo_id
  FROM mdata.qbo_vendors m
  WHERE EXISTS (SELECT 1 FROM org.companies c WHERE c.id = m.operating_company_id)
    AND m.qbo_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
        FROM accounting.qbo_vendors a
       WHERE a.operating_company_id = m.operating_company_id
         AND a.qbo_id = m.qbo_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM accounting.qbo_vendors a WHERE a.id = m.id
    );

  -- Rows without qbo_id: copy by primary key if absent.
  INSERT INTO accounting.qbo_vendors (
    id,
    operating_company_id,
    qbo_id,
    display_name,
    company_name,
    primary_email,
    primary_phone,
    active,
    payload_json,
    raw_payload,
    mirrored_at,
    last_seen_at,
    created_at,
    updated_at,
    created_in_tms,
    qbo_sync_token,
    qbo_updated_at,
    sync_status,
    qbo_push_attempts,
    eligible_1099,
    payment_terms_qbo_id,
    default_ap_account_qbo_id
  )
  SELECT
    m.id,
    m.operating_company_id,
    m.qbo_id,
    m.display_name,
    m.company_name,
    m.primary_email,
    m.primary_phone,
    COALESCE(m.active, true),
    m.payload_json,
    m.raw_payload,
    m.mirrored_at,
    m.last_seen_at,
    COALESCE(m.created_at, now()),
    COALESCE(m.updated_at, now()),
    COALESCE(m.created_in_tms, false),
    m.qbo_sync_token,
    m.qbo_updated_at,
    COALESCE(m.sync_status, 'unsynced'),
    COALESCE(m.qbo_push_attempts, 0),
    COALESCE(m.eligible_1099, false),
    m.payment_terms_qbo_id,
    m.default_ap_account_qbo_id
  FROM mdata.qbo_vendors m
  WHERE EXISTS (SELECT 1 FROM org.companies c WHERE c.id = m.operating_company_id)
    AND m.qbo_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM accounting.qbo_vendors a WHERE a.id = m.id);
END $$;

COMMIT;
