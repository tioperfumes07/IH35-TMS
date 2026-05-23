-- BATCH-8 LEDGER BACKFILL (ledger writes only, no DDL)
-- Incident: startup migration-drift guard (PR #177) detected historical pre-ledger-era drift.
-- This script writes dual-ledger rows only and does not execute migration SQL bodies.
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING.
--
-- PRE-FLIGHT (expect missing_count=136 before first execution):
-- WITH files AS (
--   SELECT filename
--   FROM (
--     VALUES
--       -- ('0001_audit_init.sql') ... generated list in docs/batch-8/missing-migrations.txt
--   ) AS v(filename)
-- )
-- SELECT count(*) AS missing_count
-- FROM files f
-- WHERE NOT EXISTS (SELECT 1 FROM _system._schema_migrations s WHERE s.filename = f.filename)
--    OR NOT EXISTS (SELECT 1 FROM ih35_migrations.applied_migrations a WHERE a.name = f.filename);
--
-- POST-FLIGHT (expect missing_count=0):
-- SELECT count(*) AS missing_count
-- FROM _system._schema_migrations s
-- FULL OUTER JOIN ih35_migrations.applied_migrations a
--   ON a.name = s.filename
-- WHERE s.filename IS NULL OR a.name IS NULL;
--
-- ROLLBACK (only if absolutely needed):
-- DELETE FROM ih35_migrations.applied_migrations WHERE applied_by = 'claude-backfill-2026-05-23';
-- DELETE FROM _system._schema_migrations WHERE applied_by = 'claude-backfill-2026-05-23';

BEGIN;

-- 0001_audit_init.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0001_audit_init.sql', '81f9eda777aff16edf5b834ca25d70e8eff741afe0254592255eff0e3f65a991', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0001_audit_init.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0002_audit_append_only_guard.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0002_audit_append_only_guard.sql', '36d55853030e7a196f42a0a70106629b6b524b0c5ce2ba49ecbcbf51a5f27f1a', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0002_audit_append_only_guard.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0003_outbox_init.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0003_outbox_init.sql', 'c8f6986fb9c994732e021bfb2da8f653aa7b3ba23f468d3b25d7c9f1067d81ea', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0003_outbox_init.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0004_identity_init.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0004_identity_init.sql', 'aa640738dffa62c19ad7675e3d89532b3cb7880ac339a00ca4aa94bb30539f1c', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0004_identity_init.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0005_identity_id_rename.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0005_identity_id_rename.sql', '26c9495babf4f6efb9194a0c08f856beb9a974ded6faffa8a6604acc8915a2c9', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0005_identity_id_rename.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0006_identity_rls_full.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0006_identity_rls_full.sql', '742307344e2652d353ba2727902f8b127bf82057fce32fccc312b0f47b8a1b96', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0006_identity_rls_full.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0007_identity_workflows.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0007_identity_workflows.sql', '109fd773f6c9bce0b4e773efffbf036ecd31b95c17e45f97ffc2edebab8633ea', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0007_identity_workflows.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0008_mdata_init.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0008_mdata_init.sql', 'ab37b6265853b1f4098d0489f401a05cb0f63f73217c49c0970dd2bc37357acc', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0008_mdata_init.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0009_mdata_workflows.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0009_mdata_workflows.sql', '7c06f75945b5b951f4cc748f182b806621768064c7a5e4b20b49472e742f8529', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0009_mdata_workflows.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0010_catalogs_init.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0010_catalogs_init.sql', 'f27f6ddbbdf0790d7408ed17d2476bc9de4d6b31baf7e51508514b87768fcaf8', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0010_catalogs_init.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0011_catalogs_workflows.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0011_catalogs_workflows.sql', 'ecc4fa98fb049eb9f9d5dc2bd1de682b8dd01c39fdfde1eaf0b0b7fe71ce502f', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0011_catalogs_workflows.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0012_identity_phone_auth.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0012_identity_phone_auth.sql', 'd17223786d69b2e940fcf91e660a18aa7fb006870f70d817d374bbadbc5561af', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0012_identity_phone_auth.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0013_org_companies.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0013_org_companies.sql', 'bccc168b538d471b7cc3d60aa3da383b561f576d2a3990c1bb4f1172dd8d4185', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0013_org_companies.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0014_user_company_access.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0014_user_company_access.sql', '64517746c02bc638ed7c0832f0b826c9e0855df6a4c7cfb98afa9543dbc5b7e7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0014_user_company_access.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0015_company_scoping.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0015_company_scoping.sql', '29eb174d747d0c5ed9369867f14be73eecb465496d468e21b837d0ad8850152e', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0015_company_scoping.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0016_company_rls_update.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0016_company_rls_update.sql', '17cf7c7fb6013ccfb47a8591a1e18e8d748a7fe0add1996aa73dfd4f471cd59d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0016_company_rls_update.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0017_equipment_types_catalog.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0017_equipment_types_catalog.sql', 'a16e11aa0757614f4f848aa2f113f19840ef81ee920adcbd734e97d9924c9971', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0017_equipment_types_catalog.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0018_driver_profile_expansion.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0018_driver_profile_expansion.sql', '3d9de16ddc53b74c45ee3fe9747adfc86349d24a8a342e1422501512b29de331', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0018_driver_profile_expansion.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0019_cust_driver_fields.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0019_cust_driver_fields.sql', 'cd7dd54b82c55218e942309c303fb584c9429982e4f5aa3aac03ec60f44db6e2', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0019_cust_driver_fields.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0020_catalog_metadata.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0020_catalog_metadata.sql', 'a2beb750187ccc06d9b322074dedae63449b11aa69e8fabbde164a80947a860d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0020_catalog_metadata.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0021_customer_full_profile.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0021_customer_full_profile.sql', 'dad4656f200e5700015e40fbd3daaafe78f412496bbcc73c5d22cfca422ea877', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0021_customer_full_profile.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0022_customer_factoring_config.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0022_customer_factoring_config.sql', '334fddad2edc8b60f0d4f64f02cf68b50e7756a34b43cecf6c86cc15f92c06c7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0022_customer_factoring_config.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0023_driver_safety_file.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0023_driver_safety_file.sql', 'eedb6842cd43d368b918d75f2393ccf318bcd89659a1f3514c33dae16a6d00cc', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0023_driver_safety_file.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0024_states_and_rehire.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0024_states_and_rehire.sql', '14f96d905642ec9919ba9550cebf57e53f581378a70bd34ebc9862215071996e', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0024_states_and_rehire.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0025_dispatcher_safety_file.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0025_dispatcher_safety_file.sql', '8f6015775587ba95c1ae58f6bc89cdbb0c86d9cdcbb5174a45924728c69ae869', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0025_dispatcher_safety_file.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0026_customer_quality_flags.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0026_customer_quality_flags.sql', '2253031bc2c8a664028e04ec31e98ee17c86b6a4d42f53e6f4638f8a4a538162', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0026_customer_quality_flags.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0027_customer_layover_config.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0027_customer_layover_config.sql', '4f3b5e8cc50baf2f708fafb22f2d77e84945c728446eff9d3650af8791eba415', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0027_customer_layover_config.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0028_docs_schema.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0028_docs_schema.sql', 'cd57377038898227b4c97ac1c3356c63168ff4c7d66bfd9f5e1ddaa2b33ba3b5', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0028_docs_schema.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0029_outbox_processor_columns.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0029_outbox_processor_columns.sql', '46e635094606588237b99b40455c941163c2cfa6e5dd7ee301c188deaaef9a0b', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0029_outbox_processor_columns.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0030_docs_files_driver_insert_rls.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0030_docs_files_driver_insert_rls.sql', '0d9c5e8dc9dd10bb0d7c4d3b9cf224413dc366f6df25162331b087e091bbee71', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0030_docs_files_driver_insert_rls.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0031_fmcsa_lookups.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0031_fmcsa_lookups.sql', '097f7540fc6cb2a062c19ad89f78b97de7efa6356c35e5383da7c6b17678b92c', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0031_fmcsa_lookups.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0032_file_links_driver_policies.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0032_file_links_driver_policies.sql', 'ad2bc3a1a968907c7bd34c55ee15b2f9c744fe5197ffcfdaa7b9ec5127f94a95', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0032_file_links_driver_policies.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0033_driver_invites.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0033_driver_invites.sql', 'aaee65edcf7c0fe213bcb96e39eb45ef0fb7e013e67747694afb517ebd73daa0', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0033_driver_invites.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0034_loads_schema.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0034_loads_schema.sql', '189de914d2e2d898282d761441d4c7fdfd72a39880b7750f0ba9d823daf6561c', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0034_loads_schema.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0035_load_cancellation_reasons.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0035_load_cancellation_reasons.sql', 'cf7c96bbc0229f75b8e81ad2cd7eca74ddf0c427a1f1dd779519da141dec7e21', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0035_load_cancellation_reasons.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0036_locations_expansion.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0036_locations_expansion.sql', '262333f0b9ff99aa298bff8abc0815927ccd395b5f82f800444ac5194a80fea2', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0036_locations_expansion.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0037_driver_teams.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0037_driver_teams.sql', '3e3ea8b553717adc6fa7bd912305670f729bf40c89ab8646633806bb0a09b69d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0037_driver_teams.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0038_dispatch_flag_colors.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0038_dispatch_flag_colors.sql', 'a45d1201b7bb9b09b929e2427f10190906aae7d6b68d0fb1a9f1d839e8ab9af7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0038_dispatch_flag_colors.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0039_fk_events_to_loads.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0039_fk_events_to_loads.sql', '47a69618f717f50774b77dfb3beec94ab705e6722589ab3fe940b80bbd155d8c', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0039_fk_events_to_loads.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0040_p3_t11_5_dispatch_rebuild.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0040_p3_t11_5_dispatch_rebuild.sql', 'f0a6bdeabae9a844fc058df0935b048afcd710db470c09f5b0ce2fed82801e30', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0040_p3_t11_5_dispatch_rebuild.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0041_p3_t11_6_maintenance_rebuild.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0041_p3_t11_6_maintenance_rebuild.sql', 'b1d4870a5d83ad25af3a3b5ee610ca08aec7778377eef974d1a1699106983bb7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0041_p3_t11_6_maintenance_rebuild.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0042_p3_t11_7_settlement_screen.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0042_p3_t11_7_settlement_screen.sql', '2345585cc71c0bc9736e7a959927a1d719325b2896e9919fa3cc2aa39016802c', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0042_p3_t11_7_settlement_screen.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0043_p3_t11_8_fuel_planner.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0043_p3_t11_8_fuel_planner.sql', '53b1544446f98cce96d32f0540ff53685a87d5ce4b361982916f7be761713fd7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0043_p3_t11_8_fuel_planner.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0044_p3_t11_9_banking_rebuild.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0044_p3_t11_9_banking_rebuild.sql', 'd34f060fe2bc11e2f54a0b8a04525f74810cabbf3fc5e5348883b3f1095747d4', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0044_p3_t11_9_banking_rebuild.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0045_p3_t11_10_safety_liabilities.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0045_p3_t11_10_safety_liabilities.sql', '393467172a1f7de482ce2dee3097d1fa92ded3bfb766c56e40e5ae3bf14aee69', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0045_p3_t11_10_safety_liabilities.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0046_p3_t11_11_cash_advance.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0046_p3_t11_11_cash_advance.sql', '9122fa20e10990c820df412be39ca840b8298b0cfa9376a3978d495ad9b63508', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0046_p3_t11_11_cash_advance.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0048_p3_t11_5_1_dispatch_gates.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0048_p3_t11_5_1_dispatch_gates.sql', '01259af3e82d6dc15833df9b659e53a6b2225b22c921a09ace7081074ac242de', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0048_p3_t11_5_1_dispatch_gates.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0049_p3_t11_6_1_wo_format_vendor_inventory_integrity.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0049_p3_t11_6_1_wo_format_vendor_inventory_integrity.sql', '85b3ec9e68acef24c82ae81950afd53a0a55c2daf71451297f81ae3761048034', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0049_p3_t11_6_1_wo_format_vendor_inventory_integrity.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0050_safety_gaps_fill.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0050_safety_gaps_fill.sql', '1d7b4cdd363752748dfea2654ddebd789546edd0a1069a01c9e1e10b61345072', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0050_safety_gaps_fill.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0050_two_section_v5_and_safety_restructure.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0050_two_section_v5_and_safety_restructure.sql', '8919f0ed54012cbbb865852a7074e0c69c9dad399357e5f14fefcffb682ec2ef', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0050_two_section_v5_and_safety_restructure.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0050a_safety_to_driver_finance_grants.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0050a_safety_to_driver_finance_grants.sql', 'c7796fb0f6485f452e8a2497d93062397e9421c7261a311af7ef15e3a6a4388d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0050a_safety_to_driver_finance_grants.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0051_arriving_soon_views.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0051_arriving_soon_views.sql', 'de47d0286c004801defd9839e6ed7c5e215441243030634185e42ab65f5592b8', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0051_arriving_soon_views.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0051_p3_t11_17_2_safety_v6_4_schema.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0051_p3_t11_17_2_safety_v6_4_schema.sql', '66926a4ed6baf853e945c616c3be7d422d99964e669570b85775ecde19c85f31', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0051_p3_t11_17_2_safety_v6_4_schema.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0052_p3_t11_12_factoring_detail.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0052_p3_t11_12_factoring_detail.sql', '3f7caafb43d876ad29c45c1eacb4dbdb584a7869a584f2b422df0a15280a14fc', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0052_p3_t11_12_factoring_detail.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0053_p3_t11_13_form_425c.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0053_p3_t11_13_form_425c.sql', '46a179518288c3d4149bca39fbb0e5482b36588533220f9c22b43cec482c9201', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0053_p3_t11_13_form_425c.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0054_p3_t11_13_form_425c_profiles.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0054_p3_t11_13_form_425c_profiles.sql', 'fcc76dcff42e4802094dbb9f25a5c39860d826a732502fea71d0163badad96f6', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0054_p3_t11_13_form_425c_profiles.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0055_p3_t11_14_lists_hub.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0055_p3_t11_14_lists_hub.sql', 'd5543daa203c87534ab5c68eb4d990a98d27dfa8122eedb0528c3490802afb2e', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0055_p3_t11_14_lists_hub.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0056_p3_t11_15_4_driver_pwa_backend.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0056_p3_t11_15_4_driver_pwa_backend.sql', '6594916be338db3176da5d553bfd0524333f0fb7d8c64cad9fac5ec98bcf9c75', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0056_p3_t11_15_4_driver_pwa_backend.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0057_p3_t11_15_6_email_login_and_uniqueness.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0057_p3_t11_15_6_email_login_and_uniqueness.sql', '167dc68d5922644a287898bbb475b4e08d8f8d7be4cf0d7cce8d10371f1c04a0', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0057_p3_t11_15_6_email_login_and_uniqueness.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0058_p3_t11_16_1_reports_infrastructure.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0058_p3_t11_16_1_reports_infrastructure.sql', 'ee992e816fd718e83450a973050645779b8a76fa2b1ac8feed792bc2529b3e8d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0058_p3_t11_16_1_reports_infrastructure.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0059_p3_t11_17_7_customer_lanes.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0059_p3_t11_17_7_customer_lanes.sql', 'b2ab9438cb8f64a32cc6f93afa1dc64e61d2b14d0b127bddac0771c127e425b1', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0059_p3_t11_17_7_customer_lanes.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0060_p3_t11_20_1_accounting_invoices_schema.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0060_p3_t11_20_1_accounting_invoices_schema.sql', 'ee1f700efada0575ea7a816a336592ea1111f5e260b641f08d36388843713ade', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0060_p3_t11_20_1_accounting_invoices_schema.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0061_p3_t11_20_5_factoring_tracking.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0061_p3_t11_20_5_factoring_tracking.sql', 'c120f7c8e91254747ac9a82b0763767b02bf0e2b89df965e8ff2c47367939e74', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0061_p3_t11_20_5_factoring_tracking.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0062_p3_t11_21_0_catalog_seed_data.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0062_p3_t11_21_0_catalog_seed_data.sql', '76e26d55f6a5434acc021388f58ecc52dc190d2eb25f0f448a3c25dacd36c403', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0062_p3_t11_21_0_catalog_seed_data.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0065_p3_cleanup_3_permanent_grants.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0065_p3_cleanup_3_permanent_grants.sql', '06ee3855e5be0df6521b76ec24b9ee1cc82930b00ceef4d4ac3d3e5a929a0a4f', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0065_p3_cleanup_3_permanent_grants.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0066_p3_t11_21_5a_maintenance_catalogs.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0066_p3_t11_21_5a_maintenance_catalogs.sql', 'f01ac755293bcb015e7319f997f288d3bac6cda4960f329a0ad29517f402fa10', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0066_p3_t11_21_5a_maintenance_catalogs.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0067_p3_t11_21_6a_fuel_catalogs.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0067_p3_t11_21_6a_fuel_catalogs.sql', '206c11b564a1533d986d280250de39daf80aa65a9ac65fa0f8828c2381aacb2d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0067_p3_t11_21_6a_fuel_catalogs.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0068_p3_t11_21_8a_fleet_catalogs.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0068_p3_t11_21_8a_fleet_catalogs.sql', 'f79749d7051c354e9272343672776d53bf8f98e30c2af3fe97796ec4506161e5', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0068_p3_t11_21_8a_fleet_catalogs.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0069_p3_t11_20_test_data_cleanup.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0069_p3_t11_20_test_data_cleanup.sql', '54972f99e6803875b68cbc275a8133eec5555d3d08e671cfe8e510df80e1f0d1', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0069_p3_t11_20_test_data_cleanup.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0070_p3_t11_21_fmcsa_customer_cache.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0070_p3_t11_21_fmcsa_customer_cache.sql', 'acaddfd8af04e8c5733bec63b2ce2672fe76cff4ce6235dff13e138f807c21f0', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0070_p3_t11_21_fmcsa_customer_cache.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0071_p3_cleanup_6_driver_phone_reconciliation.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0071_p3_cleanup_6_driver_phone_reconciliation.sql', '2ed6817f3fa147eba0025aae4dd84aefc149a3613a4341ef2677289a8c2c9af0', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0071_p3_cleanup_6_driver_phone_reconciliation.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0072_p5_t1_1_banking_bank_accounts.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0072_p5_t1_1_banking_bank_accounts.sql', '0120b2b04d10c0ff60b113e9eae8391443de16bcde138738a0a1d20a35e66754', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0072_p5_t1_1_banking_bank_accounts.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0073_p5_t1_1_banking_bank_transactions.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0073_p5_t1_1_banking_bank_transactions.sql', '8a34ce9643fe79b0fb71ae34b014c834ad5345745a3994932556215986f1828a', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0073_p5_t1_1_banking_bank_transactions.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0074_p5_t1_1_banking_transaction_categories.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0074_p5_t1_1_banking_transaction_categories.sql', 'b105b08b01f7267464fc0e220c7958ebabf2ff522d7befad925035a349cfcc8c', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0074_p5_t1_1_banking_transaction_categories.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0075_p5_t1_1_banking_reconciliation_sessions.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0075_p5_t1_1_banking_reconciliation_sessions.sql', 'd372a17085dae7da93e9ef8ba152d2e0302ff81cd1f1a72c3c3e99f6f44d56cf', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0075_p5_t1_1_banking_reconciliation_sessions.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0079_p5_t6_qbo_forensic_snapshot.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0079_p5_t6_qbo_forensic_snapshot.sql', '75cc3be83115925a7fa67fdc1d72218178908a1e550fa234903ea3a1eb3c8e7f', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0079_p5_t6_qbo_forensic_snapshot.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0080_p5_t6_hotfix_qbo_connections.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0080_p5_t6_hotfix_qbo_connections.sql', '77375c0c77b7c680088d36c916683603e7c8911ffabc0bbdcf0fc950ff8dfad9', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0080_p5_t6_hotfix_qbo_connections.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0081_p5_t6_hotfix2_schema_grants.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0081_p5_t6_hotfix2_schema_grants.sql', '7f38c4264e9dc88c8ac8930695b34b4f748413294a94d1aa8ba7e05404c3e647', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0081_p5_t6_hotfix2_schema_grants.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0082_p5_t6_hotfix5_qbo_connections_policy_bypass.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0082_p5_t6_hotfix5_qbo_connections_policy_bypass.sql', 'b0b3eea07e0a0b68042c244961282bdb99ad1cd14006acb83bbd8be24b49f857', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0082_p5_t6_hotfix5_qbo_connections_policy_bypass.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0083_p5_t6_hotfix6_qbo_archive_lucia_bypass.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0083_p5_t6_hotfix6_qbo_archive_lucia_bypass.sql', 'bc4acbc414562cda66a16f9b6f22984a9c550ff2a5956605ae1b8bd813c72ff6', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0083_p5_t6_hotfix6_qbo_archive_lucia_bypass.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0085_p5_t3_qbo_sync_queue.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0085_p5_t3_qbo_sync_queue.sql', '75bec2b1e01fa3d2a6acd069753b1206ec0c30186f3482a781dc7876f6cfe5c9', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0085_p5_t3_qbo_sync_queue.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0086_p5_t4_categorize_rls_upgrade.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0086_p5_t4_categorize_rls_upgrade.sql', 'b590f769accaf84df0b67380732450dc72c11c21499d5075acd348e297a1a6e5', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0086_p5_t4_categorize_rls_upgrade.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0087_p5_t4_bank_transactions_coa_account_id.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0087_p5_t4_bank_transactions_coa_account_id.sql', '617e6dae0ce11dd4760b1e748749e5a9173a263ff5dc31345909241b170c1f35', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0087_p5_t4_bank_transactions_coa_account_id.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0088_p5_t5_settlement_payment_state.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0088_p5_t5_settlement_payment_state.sql', 'd3127a6634a9d253c81cdc2fe6df02283a81f233a477fe55860b1dec6bcc39a7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0088_p5_t5_settlement_payment_state.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0089_p5_d1_banking_transfers.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0089_p5_d1_banking_transfers.sql', '11ec0de088782b53195e44bd47e7252943feffd74aedbfe75bcf32deb94ae495', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0089_p5_d1_banking_transfers.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0090_p5_d2_bill_payment_balance.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0090_p5_d2_bill_payment_balance.sql', '566b872f0b3d1be5a585777898c8f8e9e24e182a0ea2aad4c235617462ad8cca', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0090_p5_d2_bill_payment_balance.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0091_p5_d3_qbo_vendor_driver_asset_linkage.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0091_p5_d3_qbo_vendor_driver_asset_linkage.sql', 'f7fc2ecc158547fa5415100f23f05f59649e5b1bf7a9f53c951f6c246c23cdf7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0091_p5_d3_qbo_vendor_driver_asset_linkage.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0092_p5_d4_manual_journal_entries.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0092_p5_d4_manual_journal_entries.sql', '58f0811983ef896377c812aa15c34fc4c095d5188c68e539e30d62b46819c3a5', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0092_p5_d4_manual_journal_entries.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0093_p5_d5_load_fk_invariant_wo_time.sql
-- backfill_note: superseded_by=db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql commit=6f2422f rationale=0093 block replayed in drift reconciliation; fuel table path is conditional and absent in prod
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0093_p5_d5_load_fk_invariant_wo_time.sql', 'f9c6af0f260cb3cfcec87c127e6ad1a13fa59ece47d025a88f61296fe5ffe5e6', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0093_p5_d5_load_fk_invariant_wo_time.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0094_p5_e1_auto_deduct_escrow_load_abandonment.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0094_p5_e1_auto_deduct_escrow_load_abandonment.sql', 'd297fdf13d4b89c1d3bcf55eb10410fdc91f75d239456e535f3908b608a92e71', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0094_p5_e1_auto_deduct_escrow_load_abandonment.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0095_p5_e5_severe_repair_oos_estimate.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0095_p5_e5_severe_repair_oos_estimate.sql', '5c32948187f57020f5ec014e9c0464b4a05b8f7b2cf4e33ffbb04a6e5e7dd104', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0095_p5_e5_severe_repair_oos_estimate.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0096_p5_e2_settlement_disputes_workflow.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0096_p5_e2_settlement_disputes_workflow.sql', 'aaa305afec1b86aa6f4b52bec103b400d1f85ac7924bc5a75dc414e70dcbf039', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0096_p5_e2_settlement_disputes_workflow.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0097_p5_e3_team_drivers_split.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0097_p5_e3_team_drivers_split.sql', '59c85fa034e5b1674fe142dcf9d0551211104ab9ba49c93d70f4f944ce2c01f5', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0097_p5_e3_team_drivers_split.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0098_p5_f1_roadservice_bucket.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0098_p5_f1_roadservice_bucket.sql', 'a353d9c1a0f04b5c6423384b0eb59d7c79c4cc1b4d5c4e6d16e7f96a43c297e7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0098_p5_f1_roadservice_bucket.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0099_p5_f2_safety_active_filter.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0099_p5_f2_safety_active_filter.sql', 'b67696b4b08b860bab9ea69161c11e49c8f1ab816b42ae8a71a78c28189aa8a5', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0099_p5_f2_safety_active_filter.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0100_p5_f3_quicksave_assignments.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0100_p5_f3_quicksave_assignments.sql', 'f56d7b69c5285b02a889977235057e468f9c8792ff54db52044d7f675319f1b8', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0100_p5_f3_quicksave_assignments.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0101_p5_f4_cancellation_reasons.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0101_p5_f4_cancellation_reasons.sql', '2aa9e148e83b782237bf62da14be0cf0af0ef73a9ecef51d450920b5fbfa2e6e', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0101_p5_f4_cancellation_reasons.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0102_p5_f5_equipment_dual_confirm_transfer.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0102_p5_f5_equipment_dual_confirm_transfer.sql', '5e5bbbc3370d27d3049e6c84fe8601fb758f5296f24b26cd4654121ac9bd2d0c', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0102_p5_f5_equipment_dual_confirm_transfer.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0103_p5_g_t8_driver_vendor_merges.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0103_p5_g_t8_driver_vendor_merges.sql', '250cd34fa5c725015ab00eb971177a52890e8e8575ae14debe2dd0506daa7e7d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0103_p5_g_t8_driver_vendor_merges.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0104_p5_g_g1_faro_daily_imports.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0104_p5_g_g1_faro_daily_imports.sql', '1d3ceafe44abd83bc15f8d0295fc56de16966cde647e3c4e71023c452de69e11', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0104_p5_g_g1_faro_daily_imports.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0105_p5_g_g2_equipment_loan_infra.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0105_p5_g_g2_equipment_loan_infra.sql', '5f8b9b558be8d99be755e6014bd59705f4e79e2cb5f08125aab3de9e27fb2cae', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0105_p5_g_g2_equipment_loan_infra.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0106_p6_foundation_universal_attachments.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0106_p6_foundation_universal_attachments.sql', '875132e2bbdfbe475458dd6bc4764fc5e153444cbaf050e2dd099841fb025802', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0106_p6_foundation_universal_attachments.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0107_p6_foundation_forensic_audit_trail.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0107_p6_foundation_forensic_audit_trail.sql', 'a6d69d5ca3b17a676b2835dc69ebbb00b40be3b3ea3cd6129792783ebf85ec23', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0107_p6_foundation_forensic_audit_trail.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0108_p6_pt2_add_last_error_message_column.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0108_p6_pt2_add_last_error_message_column.sql', 'ddf9a74c4dc37a13ace9cc55f9b89ecfb86ea6ac732b33c0d816b330c100b172', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0108_p6_pt2_add_last_error_message_column.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0109_p6_s1_company_violation_amounts_auto_fine.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0109_p6_s1_company_violation_amounts_auto_fine.sql', '62cac39c795722c1a08546b45216c46724fb82c61ffd811c4c41c72cbd423794', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0109_p6_s1_company_violation_amounts_auto_fine.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0110_p6_d2_book_load_v3_loads_columns.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0110_p6_d2_book_load_v3_loads_columns.sql', '2c51afe7604ff4b939c1a2f52b8b4381315c94de21e2a46c8aed43a7785b80d2', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0110_p6_d2_book_load_v3_loads_columns.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0111_p6_d2_book_load_v3_stops_columns.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0111_p6_d2_book_load_v3_stops_columns.sql', '6a1d02c2b203ba156f22ba0c7c5ddd8def892cf3725ca9af0fdc2e8146a07651', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0111_p6_d2_book_load_v3_stops_columns.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0112_p6_d2_load_id_reservations.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0112_p6_d2_load_id_reservations.sql', '53c8b02af5f9ec550062ae359a087863c022e827be272d2b310d256c37b52c1b', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0112_p6_d2_load_id_reservations.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0113_p6_d3_driver_instructions_pdf_storage.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0113_p6_d3_driver_instructions_pdf_storage.sql', '5ace8b7adcd78ec53613fbb3af59b48015513efead0eb94c5df9c98b2fd4ef21', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0113_p6_d3_driver_instructions_pdf_storage.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0114_p6_owner_admin_role_provisioning.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0114_p6_owner_admin_role_provisioning.sql', 'c9a814e578ad59c3d7166f495b09e2166b9d3fb338ec8a2cd23633d148029934', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0114_p6_owner_admin_role_provisioning.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0115_p6_stabilization_reconciliation.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0115_p6_stabilization_reconciliation.sql', '43e9029ff991c9625defe082c0c8525dbfdccbffc18a0d55b4ca056c7fe46a69', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0115_p6_stabilization_reconciliation.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0116_p6_privilege_reconciliation.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0116_p6_privilege_reconciliation.sql', '3c90a7b377e9b753b8a673705b485c967abb64c4d9e3ffe98ee835c23a8ed03d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0116_p6_privilege_reconciliation.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0117_p6_runtime_reconciliation_maintenance_documents.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0117_p6_runtime_reconciliation_maintenance_documents.sql', '7394e876a0af3c61af3c4929f36233c5f98b96390f0c9c838104e59d95b0a1a0', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0117_p6_runtime_reconciliation_maintenance_documents.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0118_p6_arriving_soon_view_reconcile.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0118_p6_arriving_soon_view_reconcile.sql', 'e3438a42a2dd5aab9b6e2d2525afebe52e434d7c0590c9ae3fdf8c4ef049f08d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0118_p6_arriving_soon_view_reconcile.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0123_p6_pre_ledger_drift_reconciliation.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0123_p6_pre_ledger_drift_reconciliation.sql', '2d8ed1e017d32b7c3c9d1f56f93c9cd9c983f82d62fb5805e0325e4da558655e', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0123_p6_pre_ledger_drift_reconciliation.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0124_p6_active_drift_reconciliation.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0124_p6_active_drift_reconciliation.sql', '4fe831c44e9299a1d652c050e457df50944c361171289d158029e1e8a18a1fc2', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0124_p6_active_drift_reconciliation.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0125_p6_block_c_runtime_guardrails.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0125_p6_block_c_runtime_guardrails.sql', '18769d03d656b7a9203089b226224b9df11842c7f367732a72a15c8ad900b9b5', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0125_p6_block_c_runtime_guardrails.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0126_p8a_pr1_legal_schema_templates.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0126_p8a_pr1_legal_schema_templates.sql', '2361a4ea21a073c03b2825c1622b2ebeb66666aca22a7266e771f1865e6a4dc7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0126_p8a_pr1_legal_schema_templates.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0127_p8a_pr3_user_language_preference.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0127_p8a_pr3_user_language_preference.sql', 'e5e247105f1835fcbab4fe36a6b1c0a78a10bddc9153bb29e6782ff1b80ee937', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0127_p8a_pr3_user_language_preference.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0128_p8a_pr5_attorney_review_tokens.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0128_p8a_pr5_attorney_review_tokens.sql', 'bbfe0c56477cd637fd9f56a0f7bafc916d806cf35485a18ff602fb79e2f189f2', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0128_p8a_pr5_attorney_review_tokens.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0129_p8c_k_pr1_driver_scheduler.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0129_p8c_k_pr1_driver_scheduler.sql', '0c5b578f01a45a9e81dc74fbc631077ddfd2dc95698fa22775529bb0f04514f8', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0129_p8c_k_pr1_driver_scheduler.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0131_p8b_j_pr1_cash_advance_requests.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0131_p8b_j_pr1_cash_advance_requests.sql', 'c855d9f3a778607a8da6ad0eef32183f9de0ff4179f98505126bc95c121fe035', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0131_p8b_j_pr1_cash_advance_requests.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0133_p8c_i_legal_matters.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0133_p8c_i_legal_matters.sql', '72739c622d72e77aa9c40cf7f8c08eab701eebbcec28e8bc118f404b47ba8f6b', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0133_p8c_i_legal_matters.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0135_p8b_j_pr2_cash_advance_owner_approval.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0135_p8b_j_pr2_cash_advance_owner_approval.sql', '34fc800caa149fdcf7fc27b6c76385ca9859f53b01f19ba6b78e4dfad66e6fd7', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0135_p8b_j_pr2_cash_advance_owner_approval.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0136_p6_forensic_import_error_audit.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0136_p6_forensic_import_error_audit.sql', 'df5d33c500bb4f8a6ea1bb669b592325aeea6717be21610fdd38c9cbce524bda', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0136_p6_forensic_import_error_audit.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0137_p8c_m_samsara_stub_foundation.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0137_p8c_m_samsara_stub_foundation.sql', '12993b319ab5d18840b2f6c79263f74042db7084c762c32a1d6060967d124970', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0137_p8c_m_samsara_stub_foundation.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0138_p8b_j_pr3_driver_finance_stack.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0138_p8b_j_pr3_driver_finance_stack.sql', 'd271bbf923227abc26d8ac379da2a172ccdac34991d57b6167ca384c93dc4db4', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0138_p8b_j_pr3_driver_finance_stack.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0140_p6_t11171_book_load_v4_wizard_fields.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0140_p6_t11171_book_load_v4_wizard_fields.sql', 'de7848d8a505b9b8df3e09941e52b9e9e39ac03722e7909d43033554db316e9d', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0140_p6_t11171_book_load_v4_wizard_fields.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0141_p6_t11172_driver_finance_driver_bills.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0141_p6_t11172_driver_finance_driver_bills.sql', '3e6aac5afb5b22438df07ec0b81b776ef37c0ffa9a277d811e27e9409ede8f8e', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0141_p6_t11172_driver_finance_driver_bills.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0142_mdata_qbo_master_data_tables.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0142_mdata_qbo_master_data_tables.sql', 'bddd1cc68e45ed984780be2a8fcce420004d02228e54d6bfc994302b731eb291', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0142_mdata_qbo_master_data_tables.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0143_settlement_model_load_bookended_and_expense_attribution.sql
-- backfill_note: superseded_by=db/migrations/0090_p5_d2_bill_payment_balance.sql commit=6218eba rationale=AP backbone evolved to bills/bill_lines/bill_payments + expense_attribution; accounting.expenses optional branch intentionally no-op when table absent
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0143_settlement_model_load_bookended_and_expense_attribution.sql', '6ef99245e5f236b896d9bd754175ced342fde8f3d1a6ed4da6d6e4a09f872abe', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0143_settlement_model_load_bookended_and_expense_attribution.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0144_qbo_sync_observability_and_alerts.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0144_qbo_sync_observability_and_alerts.sql', '1fead37b774c9dcfcafebb333be1f1cd6f62d2f91c6479f8c50393feed2e8a0b', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0144_qbo_sync_observability_and_alerts.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0156_settlement_disputes_and_driver_teams.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0156_settlement_disputes_and_driver_teams.sql', '5a2e9a19f27f040196437539a1c187a33e9f160bed15f5c214505d8961fa05ad', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0156_settlement_disputes_and_driver_teams.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0161_driver_pwa_hardening.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0161_driver_pwa_hardening.sql', 'f54f18504ac094eca041bee5eaa812d833f67c3dee2e177685ddccd2d9263f06', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0161_driver_pwa_hardening.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql
-- backfill_note: superseded_by=db/migrations/0157_p6_t11190_qbo_profile_fields.sql commit=ca5628b rationale=qbo_vendor_id canonicalized on mdata.units; AP aging served by runtime query service commit=3adecc8 (no persistent view required)
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql', '1089d70b388bd56d982a25fff03d446cf033971f1920211db0e4f5419b1fa178', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

-- 0163_p6_t11199_qbo_sync_worker_retry_outbox.sql
-- backfill_note: superseded_by=db/migrations/0144_qbo_sync_observability_and_alerts.sql commit=352bc13 rationale=dead-letter alerting moved to qbo.sync_alerts and canonical outbox.events failure path (db/migrations/0029_outbox_processor_columns.sql commit=ad5faa7; db/migrations/0214_qbo_mdata_handler_reconciliation_orphan_cleanup.sql commit=4fd3cf9)
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('0163_p6_t11199_qbo_sync_worker_retry_outbox.sql', '27d98f97f081be32db18b255bffa863b48655454e6e89dec32e1394ef8e174b5', now(), 'claude-backfill-2026-05-23', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('0163_p6_t11199_qbo_sync_worker_retry_outbox.sql', now(), 'claude-backfill-2026-05-23')
ON CONFLICT (name) DO NOTHING;

COMMIT;
