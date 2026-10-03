# CC-3 — ROUND 329 · APPROVAL #24200 + IDEMPOTENCY AMENDMENT
Laredo 2026-10-02 14:52 CT (19:52 UTC)

## 1. #24200 — APPROVED, IN WRITING

Approved both. Acknowledge the 6 duplicate safety alerts and resolve the 6
duplicate_fire findings. Run it. Low risk, fully reversible, and the owner
already sent the approval verbally — this is the written record so there is no
second ambiguity. Paste the before count, the after count and the 12 ids you
touched into the commit.

## 2. YOUR FALSE-POSITIVE CORRECTION — ACCEPTED IN PART, 1 OF 3 STANDS

You are right that Cursor's verdict lines are wrong as written, and you were
right to push back instead of changing working code. But "running it twice
changes nothing" is only proven for SEQUENTIAL reruns. A cron job whose run
exceeds its own interval overlaps itself, and under overlap a read-then-write
guard is not a guard: both runs read the same empty state and both write.

Where the guard LIVES decides the answer, and that is the thing to measure:

- **load-real-driven-miles** — false positive CONFIRMED if the write is an
  UPDATE of a computed column to a deterministic value. Two concurrent runs
  writing the same number is benign. Confirm there is no INSERT into a
  miles-history or recalculation-log table underneath it. If there is, it
  double-ticks.

- **load-stop-geofence-sync** — THIS FLAG STANDS. "Only writes when no arrival
  is recorded yet" is a SELECT, then an INSERT. Two overlapping runs both see
  null and both stamp the arrival. That is a real double-write, and it is not
  cosmetic: a duplicate arrival stamp feeds detention and accessorial billing
  evidence, so this is money-adjacent even though the engine itself touches no
  GL. Fix it at the database: UNIQUE on (load_id, stop_id, event_type), or a
  pg_advisory_xact_lock on the load id for the duration of the job. Application
  code cannot make this safe; the constraint can.

- **draft-crew-status-selfheal** — false positive CONFIRMED if the guard is in
  the WHERE clause of the same UPDATE (`... WHERE status = 'draft'`). The second
  run's WHERE no longer matches and nothing happens. If instead it SELECTs the
  draft loads and then updates them in a later statement, it has the same
  overlap hole as the geofence job.

So: do not change the two that are clean, fix the one that is not, and post the
exact file and line for each of the three so the verdict is re-measurable. This
is how every F-RETRY verdict gets settled from here on — by where the guard
lives, not by whether the job looks harmless on a read.

## 3. THE STANDARD THIS SETS

Every scheduled engine in this app gets its idempotency from the database — a
unique business key or an advisory lock — never from a read-then-write check in
application code. QuickBooks and NetSuite both enforce at the constraint level
for exactly this reason. Add that line to the engine header template you are
building and apply it as you sweep the 165 headerless engines.

## 4. YOUR NEXT ORDER, UNCHANGED

#24166 spine fix → repurchase-time interest accrual → possible-duplicate badge →
the Faro bank-feed block. #24200 runs now, in parallel, since it is independent.

Proof in the commit or it did not happen.
