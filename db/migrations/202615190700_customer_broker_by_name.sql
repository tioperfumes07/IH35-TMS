-- 202615190700_customer_broker_by_name.sql
-- OWNER LAW 2026-10-01 (in chat to CC-2): "ALL CUSTOMERS WITH THE NAME BROKERS, LOGISTICS, OR FREIGHT, ETC MUST BE
-- CATEGORIZED IN THE APP AS BROKERS."
-- Both classification fields the app carries are set together so every screen agrees:
--   mdata.customers.customer_type     = 'broker'  (the enum the customer screens read)
--   mdata.customers.customer_type_id  = the company's catalogs.customer_types row code 'BROKER' (the catalog field)
-- on INSERT and whenever the name, the type, the type id or the company changes. A broker name can never be saved as
-- anything else. Names that only say transport / trucking / express / carrier are NOT matched (often carriers or
-- shippers) -- the owner classifies those.
-- Existing rows are re-stamped by an AUTH-gated data pass (not here). Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION mdata.customer_name_is_broker(p_name text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_name, '') ~* '\m(broker|brokers|brokerage|logistic|logistics|logistica|logisticas|logistix|freight|forwarding|forwarder|forwarders|3pl|supply chain)'
$$;
COMMENT ON FUNCTION mdata.customer_name_is_broker(text) IS
  'Owner law 2026-10-01: a customer name containing broker/brokerage/logistics/freight/forwarding/3PL/supply chain is a Broker.';

CREATE OR REPLACE FUNCTION mdata.fn_customer_broker_by_name() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_broker_type_id uuid;
BEGIN
  IF mdata.customer_name_is_broker(NEW.customer_name) THEN
    NEW.customer_type := 'broker'::mdata.customer_type;
    SELECT id INTO v_broker_type_id FROM catalogs.customer_types
     WHERE operating_company_id = NEW.operating_company_id AND code = 'BROKER' AND is_active
     ORDER BY sort_order LIMIT 1;
    IF v_broker_type_id IS NOT NULL THEN
      NEW.customer_type_id := v_broker_type_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_customer_broker_by_name ON mdata.customers;
CREATE TRIGGER trg_customer_broker_by_name
  BEFORE INSERT OR UPDATE OF customer_name, customer_type, customer_type_id, operating_company_id ON mdata.customers
  FOR EACH ROW EXECUTE FUNCTION mdata.fn_customer_broker_by_name();
COMMIT;
