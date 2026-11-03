-- ENG-60 / CASH-T03 sibling: legal.matters.insurance_lawsuit_id pointed at retired
-- insurance.lawsuit, while the FE picker emits legal.matters (type=lawsuit) IDs.
-- Retarget the FK to legal.matters so picker → writer → schema agree. Populations
-- are empty (0 legacy lawsuit rows / 0 lawsuit-matter links); table DROP of
-- insurance.lawsuit remains owner AUTH later.
--
-- Self-FK on legal.matters: a matter may link to a lawsuit matter in the same table.

ALTER TABLE legal.matters
  DROP CONSTRAINT IF EXISTS matters_insurance_lawsuit_id_fkey;

ALTER TABLE legal.matters
  ADD CONSTRAINT matters_insurance_lawsuit_id_fkey
  FOREIGN KEY (insurance_lawsuit_id) REFERENCES legal.matters(id);
