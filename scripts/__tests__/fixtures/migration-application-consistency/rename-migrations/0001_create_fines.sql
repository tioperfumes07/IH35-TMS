BEGIN;

CREATE SCHEMA IF NOT EXISTS safety;

CREATE TABLE safety.fines (
  id uuid PRIMARY KEY,
  amount_cents integer NOT NULL
);

COMMIT;
