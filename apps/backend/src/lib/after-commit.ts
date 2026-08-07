/**
 * AFTER-COMMIT WORK QUEUE — run a side-effect only once the caller's transaction has COMMITTED.
 *
 * THE DEFECT THIS EXISTS FOR (LV-REVREC-NOT-FIRING, live-proven on prod 2026-08-07): the revenue
 * latch was invoked from INSIDE an open `withCurrentUser()` transaction, but the poster
 * (`postLoadRevenueLatch`) opens its OWN connection through `withLuciaBypass()` — a different pool,
 * a different `BEGIN`. Under READ COMMITTED a second connection cannot see the first one's
 * uncommitted rows, so the poster's evidence gate re-read `actual_departure_at` off the delivery
 * stop that the caller had just stamped and found NULL. It returned `missing_delivery_evidence` and
 * posted nothing. The caller then committed and nothing ever retried.
 *
 * That failure is INVISIBLE by construction, three times over:
 *   1. the gate is a RETURN VALUE, not a throw, so the deliberate swallow-and-log never fired;
 *   2. the row the poster needed did eventually exist, so nothing looked wrong afterwards;
 *   3. every static guard was green — the call site was, lexically, exactly where it belonged.
 *
 * WHY A SHARED PRIMITIVE AND NOT FIVE MOVED CALLS (§9.0.17): "call the poster after the wrapper
 * returns" is a convention, and a convention that lives in five route files is one refactor away
 * from being broken again — silently, because the symptom is a missing ledger row rather than an
 * error. Deferring INSIDE the transaction wrapper makes the correct ordering structural: a caller
 * enqueues at the natural place in the code (right beside the status write, where it reads
 * correctly) and the work runs after COMMIT no matter what. A future delivery path is correct by
 * construction.
 *
 * ROLLBACK DISCARDS — AT EVERY LEVEL. If the transaction throws, the queue is dropped without
 * running; and if a SAVEPOINT rolls back, every task enqueued inside it is truncated away. A side
 * effect must never outlive the write that justified it. This is the half a "fire and forget after
 * the route returns" approach gets wrong.
 *
 * WHY SAVEPOINTS MATTER HERE AND NOT JUST THE OUTER COMMIT: the bulk runner
 * (`processBulkPerId`) wraps EACH row in its own savepoint on the SHARED outer client, so a row
 * whose write is rolled back would otherwise leave its task queued on a transaction that still
 * commits. For the revrec latch that is not hypothetical: Event 2 ("bill") is keyed off the
 * existence of Event 1 rather than a re-read of load status, so a rolled-back bulk
 * `completed_docs_received` row would still have posted DR A/R / CR Unbilled for a load that never
 * moved. `withSavepoint` marks the queue depth before the body and truncates back to it on
 * rollback, which makes that impossible for THIS task and every future one — the alternative,
 * teaching each task to re-verify its own precondition, is a convention again.
 *
 * SWALLOW-AND-LOG, DELIBERATELY. Tasks run after COMMIT, so a failure cannot roll the write back and
 * must not be turned into a 500 for work the user already succeeded at. Each task is isolated: one
 * failing task never prevents the next from running. Deferred recognition is surfaced by the
 * twice-daily reconcile and the scenario tracker; a 500 on the driver's "I departed" tap is not
 * recoverable.
 *
 * KEYED ON THE CLIENT OBJECT the transaction handed the callback (a `WeakMap`, so a released client
 * cannot leak a queue). In non-production `withCurrentUser` passes a Proxy wrapper rather than the
 * raw pooled client; the scope is opened on, and the callback receives, that same object, so the key
 * matches in both environments.
 */

export type AfterCommitTask = {
  /** Stable label for the failure log — names the work, not the caller. */
  label: string;
  run: () => Promise<unknown>;
};

const queues = new WeakMap<object, AfterCommitTask[]>();

/** Open an after-commit scope for a transaction client. Called by the transaction wrapper only. */
export function beginAfterCommitScope(client: object): void {
  queues.set(client, []);
}

/** True when `client` is inside a transaction that will drain an after-commit queue. */
export function hasAfterCommitScope(client: object): boolean {
  return queues.has(client);
}

/**
 * Defer `task` until the client's transaction commits.
 *
 * @returns true when the task was queued; false when this client is NOT inside a managed
 *          transaction, in which case the CALLER must run the work itself (there is nothing to wait
 *          for). Returning false rather than silently dropping is the point: a dropped money
 *          side-effect is the exact class of bug this module exists to end.
 */
export function enqueueAfterCommit(client: object, task: AfterCommitTask): boolean {
  const queue = queues.get(client);
  if (!queue) return false;
  queue.push(task);
  return true;
}

/**
 * Current queue depth, for a savepoint about to run. Called by `withSavepoint` only.
 * Returns 0 when there is no scope, which makes `afterCommitRollbackTo` a no-op — correct, because
 * a client with no scope never queued anything.
 */
export function afterCommitMark(client: object): number {
  return queues.get(client)?.length ?? 0;
}

/**
 * Discard every task enqueued since `mark` — the queue half of `ROLLBACK TO SAVEPOINT`.
 * Called by `withSavepoint` only.
 */
export function afterCommitRollbackTo(client: object, mark: number): void {
  const queue = queues.get(client);
  if (queue && queue.length > mark) queue.length = mark;
}

/**
 * Run every queued task, in enqueue order, after COMMIT. Called by the transaction wrapper only.
 * Each task is isolated — a throw is logged and the remaining tasks still run.
 */
export async function drainAfterCommit(client: object): Promise<void> {
  const queue = queues.get(client);
  queues.delete(client);
  if (!queue || queue.length === 0) return;
  for (const task of queue) {
    try {
      await task.run();
    } catch (err) {
      console.warn({ err, task: task.label }, "after_commit_task_failed");
    }
  }
}

/** Drop the queue without running it (ROLLBACK). Called by the transaction wrapper only. */
export function discardAfterCommit(client: object): void {
  queues.delete(client);
}
