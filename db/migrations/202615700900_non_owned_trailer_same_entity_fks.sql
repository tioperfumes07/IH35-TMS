-- 202615700900 · CC-3 · RULING 443.92 #2 — the non_owned_trailer_id columns added by 202615650900 (443.90 #4) get their
-- same-entity twins (ROUND 345: a row may only reference a row of its OWN operating company; verify-money-lines-same-entity-fks).
-- The parent gains the (operating_company_id, id) key the composite FKs reference. Every existing row was written by the
-- printed-trailer decision engine in the load's own company (0 cross-company rows), so each FK is added NOT VALID, then
-- VALIDATED. Idempotent. History is not modified.
SET LOCAL lock_timeout = '60s';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.non_owned_trailers'::regclass AND conname = 'non_owned_trailers_co_id_key') THEN
    ALTER TABLE dispatch.non_owned_trailers ADD CONSTRAINT non_owned_trailers_co_id_key UNIQUE (operating_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_non_owned_trailer_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_non_owned_trailer_same_entity_fkey
      FOREIGN KEY (operating_company_id, non_owned_trailer_id) REFERENCES dispatch.non_owned_trailers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_non_owned_trailer_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.expenses'::regclass AND conname = 'expenses_non_owned_trailer_same_entity_fkey') THEN
    ALTER TABLE accounting.expenses ADD CONSTRAINT expenses_non_owned_trailer_same_entity_fkey
      FOREIGN KEY (operating_company_id, non_owned_trailer_id) REFERENCES dispatch.non_owned_trailers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.expenses VALIDATE CONSTRAINT expenses_non_owned_trailer_same_entity_fkey;

-- mdata.loads.team_id: a fresh migration chain carries a single-column FK to mdata.driver_teams (0156) that prod does not
-- (measured 2026-10-12: prod has no FK on loads.team_id and 0 loads with a team). Its same-entity twin closes the gap on
-- every database; on prod it is the first FK on the column (0 rows to validate).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_team_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_team_same_entity_fkey
      FOREIGN KEY (operating_company_id, team_id) REFERENCES mdata.driver_teams (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_team_same_entity_fkey;
