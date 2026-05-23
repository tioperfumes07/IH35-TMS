CREATE SCHEMA IF NOT EXISTS safety;

CREATE TABLE IF NOT EXISTS safety.fines (
  id uuid PRIMARY KEY
);

DO $$
BEGIN
  IF to_regclass('safety.fines') IS NOT NULL
     AND to_regclass('safety.civil_fines') IS NULL THEN
    ALTER TABLE safety.fines RENAME TO civil_fines;
  END IF;
END
$$;
