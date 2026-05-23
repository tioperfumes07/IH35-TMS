CREATE SCHEMA IF NOT EXISTS qa;

CREATE TABLE IF NOT EXISTS qa.parent (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS qa.child (
  id uuid PRIMARY KEY,
  parent_id uuid
);

DO $$
BEGIN
  IF to_regclass('qa.optional_parent') IS NOT NULL THEN
    ALTER TABLE qa.child
      ADD CONSTRAINT fk_child_optional_parent
      FOREIGN KEY (parent_id) REFERENCES qa.optional_parent(id);
  END IF;
END
$$;
