-- 202615410300_one_reversal_per_posting_line.sql
-- CC-1 · AUTH-400 rehearsal finding (2026-10-04) — a posting line is reversed EXACTLY ONCE, enforced by the database.
--
-- Measured on the AUTH-400 rehearsal branch: expense line 8314452b ($24.59, 5010) ended up with TWO reversal lines.
-- Reclassify's out-leg named it (reversal_of_line_id) without stamping its reversed_by_line_id, so the line read as live
-- and the expense void (posting engine) reversed it again and overwrote the back-link. The code is fixed at the root
-- (the one posting-line writer stamps both directions and refuses an already-reversed original; the posting-engine
-- reversal reverses only LIVE lines and never overwrites a back-link). This index makes a second reversal of the same
-- line impossible from ANY writer, present or future.
--
-- Production measured before this migration (read-only, 2026-10-04): 0 lines with more than one reversal line, so the
-- index builds cleanly. Additive; no data changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE UNIQUE INDEX IF NOT EXISTS uq_jep_one_reversal_per_line
  ON accounting.journal_entry_postings (reversal_of_line_id)
  WHERE reversal_of_line_id IS NOT NULL;
COMMENT ON INDEX accounting.uq_jep_one_reversal_per_line IS
  'AUTH-400: a posting line is reversed exactly once. A second line naming the same reversal_of_line_id is refused.';
COMMIT;
