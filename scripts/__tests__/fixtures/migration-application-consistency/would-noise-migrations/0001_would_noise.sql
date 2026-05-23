BEGIN;

-- CREATE TABLE IF NOT EXISTS would silently skip and leave the wrong shape.
DO $$
BEGIN
  RAISE NOTICE 'This would be noisy but is not a DDL declaration.';
END
$$;

CREATE SCHEMA IF NOT EXISTS qa;

CREATE TABLE IF NOT EXISTS qa.real_table (
  id uuid PRIMARY KEY
);

COMMIT;
