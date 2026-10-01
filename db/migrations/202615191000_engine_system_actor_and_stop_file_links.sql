-- 202615191000_engine_system_actor_and_stop_file_links.sql -- ROUND 313 E-32 (claim #23861).
-- docs.file_links.entity_type gains 'load_stop', so a Samsara Proof of Delivery links to the stop it was taken at,
-- not only to the load. (The engines' System actor 00000000-0000-4000-8000-000000000001 already exists in
-- identity.users since 2026-09-22 -- measured with the RLS bypass -- so no identity change is made here; the
-- 202615190900 claim stays unused.) Additive; idempotent.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE docs.file_links DROP CONSTRAINT IF EXISTS chk_file_links_entity_type_widened_work_order;
ALTER TABLE docs.file_links DROP CONSTRAINT IF EXISTS chk_file_links_entity_type_widened_load_stop;
ALTER TABLE docs.file_links ADD CONSTRAINT chk_file_links_entity_type_widened_load_stop CHECK (entity_type = ANY (ARRAY[
  'driver'::text, 'customer'::text, 'vendor'::text, 'unit'::text, 'equipment'::text, 'load'::text, 'settlement'::text,
  'invoice'::text, 'tax_document'::text, 'medical_card'::text, 'background_check'::text, 'fine'::text,
  'company_violation'::text, 'drug_test'::text, 'hos_violation'::text, 'dot_inspection'::text, 'fuel_transaction'::text,
  'expense'::text, 'bill'::text, 'cash_advance'::text, 'broker_advance'::text, 'invoice_dispute'::text, 'work_order'::text,
  'load_stop'::text]));

COMMIT;
