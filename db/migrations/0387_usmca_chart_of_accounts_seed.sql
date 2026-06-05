-- USMCA-2: seed chart of accounts for USMCA by cloning TRANSP template structure (idempotent).
BEGIN;

DO $$
DECLARE
  v_transp_id uuid;
  v_usmca_id uuid;
  v_transp_count int;
  v_usmca_count int;
BEGIN
  SELECT id INTO v_transp_id FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  SELECT id INTO v_usmca_id FROM org.companies WHERE code = 'USMCA' LIMIT 1;
  IF v_transp_id IS NULL OR v_usmca_id IS NULL THEN
    RAISE NOTICE 'usmca_coa_seed: TRANSP or USMCA company missing — skip';
    RETURN;
  END IF;

  IF to_regclass('accounting.qbo_accounts') IS NULL THEN
    RAISE NOTICE 'usmca_coa_seed: accounting.qbo_accounts missing — skip';
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_usmca_count
  FROM accounting.qbo_accounts
  WHERE operating_company_id = v_usmca_id;

  IF v_usmca_count > 0 THEN
    RAISE NOTICE 'usmca_coa_seed: USMCA already has % CoA rows — skip', v_usmca_count;
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_transp_count
  FROM accounting.qbo_accounts
  WHERE operating_company_id = v_transp_id;

  IF v_transp_count = 0 THEN
    RAISE NOTICE 'usmca_coa_seed: TRANSP template empty — skip';
    RETURN;
  END IF;

  CREATE TEMP TABLE tmp_usmca_coa_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_usmca_coa_map (old_id, new_id)
  SELECT id, gen_random_uuid()
  FROM accounting.qbo_accounts
  WHERE operating_company_id = v_transp_id;

  INSERT INTO accounting.qbo_accounts (
    id,
    operating_company_id,
    qbo_id,
    qbo_sync_token,
    name,
    full_qualified_name,
    account_type,
    account_sub_type,
    active,
    qbo_updated_at,
    mirrored_at,
    payload_json,
    sync_status,
    qbo_push_attempts,
    parent_id,
    parent_synced
  )
  SELECT
    m.new_id,
    v_usmca_id,
    NULL,
    NULL,
    src.name,
    src.full_qualified_name,
    src.account_type,
    src.account_sub_type,
    src.active,
    NULL,
    now(),
    src.payload_json,
    'unsynced',
    0,
    NULL,
    NULL
  FROM accounting.qbo_accounts src
  JOIN tmp_usmca_coa_map m ON m.old_id = src.id
  WHERE src.operating_company_id = v_transp_id;

  UPDATE accounting.qbo_accounts usmca_child
  SET parent_id = parent_map.new_id
  FROM accounting.qbo_accounts src_child
  JOIN tmp_usmca_coa_map child_map ON child_map.old_id = src_child.id
  JOIN tmp_usmca_coa_map parent_map ON parent_map.old_id = src_child.parent_id
  JOIN accounting.qbo_accounts usmca_child ON usmca_child.id = child_map.new_id
  WHERE src_child.operating_company_id = v_transp_id
    AND usmca_child.operating_company_id = v_usmca_id
    AND src_child.parent_id IS NOT NULL;

  RAISE NOTICE 'usmca_coa_seed: cloned % accounts from TRANSP to USMCA', v_transp_count;
END $$;

COMMIT;
