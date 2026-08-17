-- FINDING: LV-USMCA-TEST-FIXTURES-LIVE-IN-DRIVER-VENDOR-CUSTOMER-ROSTERS — found live 2026-08-16
-- while checking accounting:invoices-create-drawer and accounting:expenses-create-drawer on the eve
-- of USMCA go-live. The row-259 fix (202612700000) archived 7 test cash-advance GL accounts but
-- only reached that one table; the SAME class of ad-hoc test/audit-fixture data is live and ACTIVE
-- in three more USMCA rosters that operators pick from directly in production create-drawers:
--
--   mdata.drivers   6 rows  (first_name literally "TEST"/"SAMPLE"/"CODEX"/"Juan", one status='Active')
--   mdata.vendors  11 rows  (the auto-provisioned 1099 vendor per fixture driver, + standalone smoke
--                            vendors like "P42-VENDOR-FK-20260811", "CC1 Battery Vendor 20260806-A")
--   mdata.customers 13 rows (e.g. "GUARD-TEST-customers-name-USMCA", "P23-SMOKE-1786500785935")
--
-- Live-verified via the actual invoice-create Customer picker and expense-create Vendor picker:
-- fixture names dominate the FIRST page of both pickers an operator sees. Not a cosmetic issue --
-- picking the wrong "Juan USMCA-Battery" vs a real driver is exactly the class of error McLeod/QBO-
-- grade honesty exists to prevent.
--
-- EXCLUDED ON PURPOSE (2 customers, 1 vendor): the "ZZ-SAMPLE ... USMCA_GATEB_SAMPLE_2026-08-07"
-- triad (customer A/B + vendor A) are a deliberate, still-in-use GATE-B smoke fixture with real
-- postings against it (verified live 2026-08-16 while root-causing row 626) -- archiving those would
-- break an active guard/smoke-test surface, not fix a defect. Left untouched.
--
-- Live-verified before writing this migration: none of the archived rows are deleted or lose any
-- linked data. "Juan USMCA-Battery" (driver) has 4 real loads + 2 real settlements attached -- those
-- rows are untouched; the driver just stops appearing in the ACTIVE roster/pickers (deactivated_at
-- gates RLS visibility on all three tables). Void-not-delete, no DELETE anywhere in this file.
--
-- mdata.drivers has a CHECK constraint: deactivated_at IS NULL OR status IN ('Inactive','Terminated')
-- -- status is set to 'Inactive' in the same UPDATE for the 2 rows that were 'Probation'/'Active',
-- satisfying the constraint atomically (never a transient invalid state).

BEGIN;

UPDATE mdata.drivers
SET status = 'Inactive',
    deactivated_at = now(),
    archived_at = now(),
    updated_at = now()
WHERE id = ANY(ARRAY[
  '10b66f79-fa2e-4e6e-aeb8-2eb9546cb419', -- TEST Driver-One-20260806
  '455450bd-afcd-4f47-8c6a-f9dd75618d8d', -- SAMPLE Cascade-1612
  '80765f07-fb4a-499b-a13f-f854d3492bf3', -- TEST DRIVER-USMCA
  '88c04cf5-9e32-455c-91e5-298a9b331b10', -- Juan USMCA-Battery
  'ad46bb79-c1fd-42bb-8c40-a68a39095694', -- SAMPLE Cascade-2042
  'b6e60c70-5384-44e8-87aa-3b7bbc373cdb'  -- CODEX AUDIT-SPINE-DRIVER-20260816-0329
]::uuid[])
AND deactivated_at IS NULL;

UPDATE mdata.vendors
SET deactivated_at = now(),
    updated_at = now()
WHERE id = ANY(ARRAY[
  '40fc1104-896b-4c42-9a5d-971a9e468abc', -- Juan USMCA-Battery
  '308f6434-0a51-4109-953e-c86ffb1f0999', -- CC3 Battery Vendor 20260806-01
  '37e2115c-bc62-42c8-9f29-19c031147d54', -- CC1 Battery Vendor 20260806-A
  'a4f40fba-dd17-4b08-abbd-93a346c00e7f', -- CC2-BATTERY-20260807-VENDOR-01
  '38c2e2f4-56ef-4d4c-8788-89db2d50a6d3', -- SAMPLE Vendor Cascade-2046
  'f6ecae2f-b1fa-4681-8c9e-b2730ee1fcee', -- SAMPLE Cascade-2042
  'abd5fcc4-28ee-42ec-a8e1-d611de61ec61', -- CASCADE CA24 Sample Vendor
  '75aec7c1-56c1-452d-bffd-21b58705229c', -- CC2-GUARD-VERIFY-20260811-VENDOR
  '2cbaf657-6aa1-4f6b-a54b-c1863e05162a', -- P42-VENDOR-FK-20260811
  '3e5cc896-63a5-43ee-8426-0976031e1e82', -- CODEX-AUDIT-SPINE-VENDOR-20260816-0327
  '2fff082e-297f-42ef-b8d9-22a22504e61d'  -- CODEX AUDIT-SPINE-DRIVER-20260816-0329 (vendor record)
]::uuid[])
AND deactivated_at IS NULL;

UPDATE mdata.customers
SET status = 'inactive',
    deactivated_at = now(),
    archived_at = now(),
    updated_at = now()
WHERE id = ANY(ARRAY[
  '0f65bf5e-07f9-46e4-babc-f2bb1b16b121', -- GUARD-TEST-customers-name-USMCA
  '01a29250-9bc1-4679-9613-79331056294d', -- TEST-Customer-One-20260806
  '45226738-fcfa-40f0-944d-574e6725bcd6', -- CC2-BATTERY-20260807-CUSTOMER-01
  'd442fee7-5aca-457f-8fda-e4045b555bbe', -- SAMPLE Customer Cascade-2046
  'cfa35668-3b6f-4520-a957-09f78533bc57', -- USMCA-CODEX-CREATE-20260810-0117
  '5249c740-bb8c-4659-8514-dbe3bdd94f40', -- USMCA-CODEX-SUBCUSTOMER-20260810-0126
  'afa8db32-c3bc-4691-b68f-bb5dc0d54d9c', -- CC2-GUARD-VERIFY-20260811-CUSTOMER
  '74d472a8-2f8a-4707-9285-5708346e8cd9', -- CC2-BOOKLOAD-INLINE-TEST
  '4c2abbe6-348c-46e4-aeda-1cd9d7322593', -- P23-SMOKE-1786500785935
  '99e5e3d7-7f9f-4d7f-8e0b-cf0ec2c7ef07', -- P23-SMOKE-1786500973506
  '8e816e7d-2b1d-4de6-8039-33bbbaba9083', -- USMCA_P43_BILLING_SMOKE_20260812
  'e542138b-3928-4247-9bca-c6763ffee415', -- P23-SMOKE-1786551245780
  '9e5f5eca-df4f-4f43-b8a5-6833bef01a9a'  -- CODEX-AUDIT-SPINE-20260816-0320
]::uuid[])
AND deactivated_at IS NULL;

COMMIT;
