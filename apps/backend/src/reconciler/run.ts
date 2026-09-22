import { RECONCILER_INVARIANTS } from "./registry.js";
import type { Invariant, InvariantResult, Queryable, ReconcilerRun } from "./types.js";

/**
 * Runs every invariant and reports each one as ok (with its exceptions) or error. An invariant
 * that throws is recorded, never swallowed, and cannot hide the ones after it. Must be called
 * inside a transaction: each invariant runs under its own savepoint so one failed query does not
 * abort the rest.
 */
export async function runReconciler(
  client: Queryable,
  operatingCompanyId: string,
  invariants: readonly Invariant[] = RECONCILER_INVARIANTS
): Promise<ReconcilerRun> {
  const results: InvariantResult[] = [];
  for (const invariant of invariants) {
    await client.query("SAVEPOINT reconciler_invariant");
    try {
      const exceptions = await invariant.detect(client, operatingCompanyId);
      await client.query("RELEASE SAVEPOINT reconciler_invariant");
      results.push({ invariant: invariant.id, title: invariant.title, status: "ok", exceptions });
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT reconciler_invariant");
      results.push({
        invariant: invariant.id,
        title: invariant.title,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        exceptions: [],
      });
    }
  }
  return {
    operating_company_id: operatingCompanyId,
    ran_at: new Date().toISOString(),
    results,
    exception_count: results.reduce((n, r) => n + r.exceptions.length, 0),
    errored_invariants: results.filter((r) => r.status === "error").map((r) => r.invariant),
  };
}
