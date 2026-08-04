/**
 * GUARD — LINK-F01: fuel entered through the TMS must carry its load link. INGESTED history must not.
 *
 * WHY THE SCOPE IS THE WHOLE POINT. G18 requires every diesel/roadside fuel expense to FK to a load.
 * On prod today that is 0 of 1,548 — and that is EXPECTED STATE, not a defect:
 *
 *   all 1,548 fuel transactions are Relay-ingested (notes carry `relay_bridge=1`); TMS-native fuel
 *   transactions: ZERO. mdata.loads holds 4 non-deleted rows whose stops span 2026-06-04..2026-06-29,
 *   against fuel spanning 2026-03-03..2026-08-03.
 *
 * The TMS is not dispatching loads yet. Fuel is being CATEGORIZED from ingested card history; trips are
 * not being run through the system. You cannot link a purchase to a load that was never dispatched, so
 * demanding linkage on ingested rows would flag the business's actual operating state as a bug.
 *
 * This is the SAME shape as ledger row 665, where 16,245 of 16,250 bills are QBO clones and "no journal
 * entry" is correct behaviour under parallel books rather than a posting gap. An earlier version of
 * this guard asserted across ALL fuel rows and would have gone RED on prod against expected state —
 * the "expected-state-recorded-as-failure" anti-pattern that has already cost this project real time.
 * It is scoped deliberately, and the scope is the fix.
 *
 * WHAT IT ENFORCES: among fuel transactions that ORIGINATED IN THE TMS (not Relay-ingested), a single
 * `load_exemption_reason` may not account for every row. An escape hatch covering 100% of the rows it
 * governs is not a control — it is a control reported as satisfied while measuring nothing.
 *
 * TODAY THIS ASSERTS NOTHING, and says so rather than implying coverage: the TMS-native set is empty,
 * so there is no population to judge. It becomes load-bearing on the first day the TMS dispatches and
 * fuel is captured against a trip — which is exactly when the linkage must start holding, and exactly
 * when this would otherwise be forgotten.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

/** Below this, a single reason is unremarkable rather than evidence of a vacuous control. */
export const MIN_ROWS_TO_JUDGE = 25;

export function isVacuousExemption(total: number, topReasonCount: number): boolean {
  if (total < MIN_ROWS_TO_JUDGE) return false;
  return topReasonCount === total;
}

describeIntegration("LINK-F01 TMS-native fuel keeps its load link (real Postgres)", () => {
  let db: pg.Client;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    // Session-scoped is safe on a dedicated client against the DIRECT endpoint. Over `-pooler` it would
    // not survive between statements and FORCE-RLS would silently return zero rows (DB-F01) — which is
    // why the discriminator below refuses to judge an unreadable table.
    await db.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
    // 30s: CI's Postgres is local, but a remote verification run must not fail on connect latency.
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  it("a single exemption reason must not cover every TMS-NATIVE fuel transaction", async () => {
    const { rows } = await db.query<{
      all_rows: string;
      live: string;
      native: string;
      top_count: string;
      top_reason: string | null;
    }>(`
      WITH native AS (
        SELECT * FROM fuel.fuel_transactions
         WHERE COALESCE(notes,'') NOT ILIKE '%relay_bridge=1%'
      ),
      r AS (
        SELECT load_exemption_reason AS reason, count(*)::bigint AS c
          FROM native WHERE load_exemption_reason IS NOT NULL
         GROUP BY 1 ORDER BY 2 DESC LIMIT 1
      )
      SELECT (SELECT count(*) FROM fuel.fuel_transactions)::text AS all_rows,
             (SELECT COALESCE(n_live_tup,0) FROM pg_stat_user_tables
               WHERE schemaname='fuel' AND relname='fuel_transactions')::text AS live,
             (SELECT count(*) FROM native)::text AS native,
             COALESCE((SELECT c FROM r),0)::text AS top_count,
             (SELECT reason FROM r) AS top_reason
    `);
    const r = rows[0];
    const allRows = Number(r.all_rows);
    const live = Number(r.live);
    const native = Number(r.native);

    // DB-F01 discriminator: a masked table would make "no vacuous exemption" a false pass.
    if (live > 0) {
      expect(
        allRows >= live * 0.9,
        `fuel.fuel_transactions: only ${allRows} of ~${live} rows visible — the RLS bypass did not take, so this result is not proof`
      ).toBe(true);
    }

    if (native < MIN_ROWS_TO_JUDGE) {
      // Say it out loud rather than banking a silent green: today every fuel row is ingested history,
      // so this assertion has no population and proves nothing yet.
      console.warn(
        `[LINK-F01] ${native} TMS-native fuel transactions (of ${allRows} total) — below the ` +
          `${MIN_ROWS_TO_JUDGE}-row threshold, so load-attribution is NOT asserted. This is expected ` +
          `while the TMS is not yet dispatching loads; it becomes load-bearing once it is.`
      );
      return;
    }

    const topCount = Number(r.top_count);
    expect(
      isVacuousExemption(native, topCount),
      `load_exemption_reason='${r.top_reason}' covers ${topCount} of ${native} TMS-NATIVE fuel ` +
        `transactions — every one. These originated in the TMS, so a load was dispatchable and the ` +
        `link should exist. An escape hatch covering 100% of the rows it governs is not a control.`
    ).toBe(false);
  });
});
