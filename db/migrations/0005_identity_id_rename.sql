-- BT-0-AUTH-01 patch: rename identity.users.uuid -> id for Lucia adapter
-- Section E: deviation from Master Blueprint Part 7 column convention.
-- Lucia v3 PostgreSQL adapter hardcodes "id" as the user-id column name.

BEGIN;

ALTER TABLE identity.sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE identity.users RENAME COLUMN uuid TO id;
ALTER TABLE identity.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;

COMMIT;
