-- PROGRAM-BOARD — two-way notes for the in-app Program Board (docs/trackers block/task tracker).
-- NON-FINANCIAL internal tooling. Owner posts answers/ideas/notes in-app; the agent posts questions.
-- Nothing is ever lost (void-not-delete). CREATE-only, idempotent, self-contained grants.
--
-- SCOPING DEVIATION (deliberate, documented): the Program Board is a GLOBAL internal staff tool that
-- tracks REPO-WIDE blocks/tasks, not per-operating-company data. Per-entity RLS scoping does NOT fit —
-- a note about block "RECON-01" is not owned by TRANSP or TRK. So this is a GLOBAL table readable/
-- writable by any authenticated staff session (which can only reach it through the ih35_app role behind
-- Lucia auth). RLS is still ENABLED + FORCED to satisfy the every-table-gets-RLS invariant, with a
-- permissive global policy. No operating_company_id column by design.
--
-- The ops schema already exists (0192). ih35_app is the runtime role.

BEGIN;

CREATE TABLE IF NOT EXISTS ops.program_board_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- server-gen (no uuidv7 DB fn in repo; matches
                                                            -- neighbor migrations recon_runs/audit_chain_verifications)
  block_id     text,                                        -- NULL = general / free-standing idea
  kind         text NOT NULL CHECK (kind IN ('question','answer','idea','note')),
  author       text NOT NULL CHECK (author IN ('agent','owner')),
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'open',
  created_by   uuid,                                        -- app.current_user_id of the author (owner side)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  voided_at    timestamptz,                                 -- void-not-delete
  is_active    boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS program_board_notes_block_idx
  ON ops.program_board_notes (block_id, created_at DESC)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS program_board_notes_kind_idx
  ON ops.program_board_notes (kind, created_at DESC)
  WHERE is_active;

-- Grants: SELECT/INSERT/UPDATE only — NO DELETE (void-not-delete). ops default privileges may auto-grant
-- DELETE, so REVOKE it explicitly. (REVOKE trips the hold-merge-gate → correct: this is a HOLD migration.)
GRANT USAGE ON SCHEMA ops TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON ops.program_board_notes TO ih35_app;
REVOKE DELETE ON ops.program_board_notes FROM ih35_app;

-- RLS: enabled + forced (invariant), permissive global policy (see header — global staff tool).
ALTER TABLE ops.program_board_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.program_board_notes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_board_notes_global_all ON ops.program_board_notes;
CREATE POLICY program_board_notes_global_all ON ops.program_board_notes FOR ALL
  USING (true)
  WITH CHECK (true);

COMMIT;
