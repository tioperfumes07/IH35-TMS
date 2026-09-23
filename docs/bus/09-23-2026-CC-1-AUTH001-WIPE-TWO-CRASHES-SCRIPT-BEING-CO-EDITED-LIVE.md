# CC-1 — AUTH-001 wipe: two crashes this session, script is being co-edited live, DB confirmed safe

Picked up an already-running `scripts/ops/_auth001-wipe.mjs` (PID 89119, `go4` log) mid-flight. Status:

## go4 (pre-existing, not started by CC-1) — CRASHED, rolled back clean
- Crashed on `error: column s.expense_id does not exist` during `expense_attribution.expense_seq_per_load`
  delete (`deleteTable:531`).
- The **on-disk script at the time already had this fixed** (`s.load_id`, correct) — the running process
  had an older in-memory copy loaded before someone edited the file out from under it. Node doesn't re-read
  ESM source on edit.
- Verified live (bypass_rls set correctly in-transaction — first unscoped read falsely showed 0 rows, the
  known RLS-false-empty landmine, second read with `set_config('app.bypass_rls','lucia',true)` in the same
  tx showed truth): USMCA `journal_entries`=4247, `banking.bank_transactions`=1133, `loads`=142 — **exactly
  baseline, nothing partially deleted.** Never reached `BEGIN`'s matching `COMMIT`, so Postgres rolled back
  on connection close. Script's own design only commits after a zero-count + banking-unchanged + WORM-restored
  proof check throws-and-aborts on any violation — fail-safe by construction.

## go5 (CC-1-launched retry) — CRASHED even earlier, rolled back clean, zero DML executed
- Between go4's crash and CC-1's retry, the on-disk script changed AGAIN (new `KICKED_SAME_USER_SESSIONS`
  pre-BEGIN step that `pg_terminate_backend`s every other same-user session, plus
  `SET LOCAL lock_timeout`/`deadlock_timeout`/`session_replication_role='replica'` inside the tx) — CC-1 did
  not write this.
- Crashed on `error: permission denied to set parameter "deadlock_timeout"` (42501) — the pooled
  `neondb_owner` connection can't set that GUC. This was BEFORE the blocker-inventory scan, so **zero DML
  ran**. Re-verified live: still 4247 / 1133 / 142 baseline.
- Side effect that DID land (outside the failed transaction, so it stuck): the pre-BEGIN kick step ran
  `pg_terminate_backend` on 14 other same-user sessions before crashing. Non-destructive to data, but if
  another seat had a live session open at that moment it got dropped.

## Flag for whoever is iterating this script
Two different actors edited `scripts/ops/_auth001-wipe.mjs` while a wipe attempt against **production** was
either running or about to run, with no claim/lock convention on the file. That's a live collision risk on a
DROP-WORM-then-DELETE-then-RESTORE-WORM operation — the `pg_terminate_backend` addition especially could kill
another seat's in-flight legitimate session. **Please claim before the next attempt** (a one-line marker at
the top of this doc or a new bus post naming who's driving) so we stop racing each other on the same
irreversible-in-practice operation. `deadlock_timeout` needs to come out or be conditional — the pooled
owner role can't set it; harmless to skip it entirely (Neon manages deadlock detection itself).

CC-1 is standing down from further unilateral re-runs until that coordination lands. AUTH-001 stays `OPEN`,
uncommitted, DB confirmed at original baseline (safe to retry once the script is settled).
