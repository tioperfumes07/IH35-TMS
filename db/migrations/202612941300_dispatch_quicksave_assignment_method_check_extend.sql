-- DISPATCH-F-QUICKSAVE-ASSIGN-500 (2026-08-21, CC-3)
--
-- Every inline row-level Unit/Trailer/Driver assignment on the Dispatch load board (the
-- InlineUnitPicker/InlineTrailerPicker "Assign"/"Change" pickers, secondary.assignments leaf) 500s
-- in production. Live-reproduced on 2 real loads (L-20260811-0026, L-20260810-0006) via a direct
-- fetch() replay of the PATCH .../assign-unit endpoint: Postgres 23514 check-constraint violation on
-- dispatch.load_assignment_history_assignment_method_check.
--
-- apps/backend/src/dispatch/assignments/quicksave.service.ts's reassignUnit/reassignTrailer/
-- reassignDriver pass method:"inline_quicksave_unit"/"inline_quicksave_trailer"/
-- "inline_quicksave_driver" into dispatch.load_assignment_history.assignment_method -- none of
-- which were ever added to the CHECK constraint (migration 0159 defined it as
-- 'full_form','quicksave','drag_drop','auto_reassign','manual_reassign' only). This has evidently
-- been broken since these inline pickers shipped -- every single assignment made through them fails
-- and silently rolls back client-side (the frontend's optimistic-patch rollback correctly reverts
-- the UI on the 500, so it LOOKS like nothing happened rather than showing a loud error).
--
-- Additive only (Invariant #24) -- same DROP+ADD pattern this exact constraint already used in
-- migration 0159 to add 'manual_reassign'. No existing row's assignment_method value is affected;
-- this only widens what NEW rows are allowed to write.
BEGIN;

ALTER TABLE dispatch.load_assignment_history
  DROP CONSTRAINT IF EXISTS load_assignment_history_assignment_method_check;

ALTER TABLE dispatch.load_assignment_history
  ADD CONSTRAINT load_assignment_history_assignment_method_check
  CHECK (assignment_method IN (
    'full_form', 'quicksave', 'drag_drop', 'auto_reassign', 'manual_reassign',
    'inline_quicksave_unit', 'inline_quicksave_trailer', 'inline_quicksave_driver'
  ));

COMMIT;
