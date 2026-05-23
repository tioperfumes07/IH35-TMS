BEGIN;

CREATE SCHEMA IF NOT EXISTS qa;

CREATE TABLE qa.parent (
  id uuid PRIMARY KEY
);

CREATE TABLE qa.child (
  id uuid PRIMARY KEY,
  parent_id uuid,
  CONSTRAINT fk_child_parent FOREIGN KEY (parent_id) REFERENCES qa.parent(id)
);

CREATE INDEX IF NOT EXISTS idx_child_parent ON qa.child (parent_id);

COMMIT;
