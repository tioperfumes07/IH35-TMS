/**
 * GUARD — LINK-F01: the G18 load-attribution control must not be satisfied by a blanket exemption.
 *
 * THE RULE. Every diesel/roadside fuel expense must FK to a load (G18, "critical"). fuel_transactions
 * enforces it with `load_required` plus an escape hatch, `load_exemption_reason`, for the genuine cases
 * where no load can be determined.
 *
 * WHAT PROD ACTUALLY SHOWS (verified 2026-08-04, bypass in-transaction, entity-wide):
 *   1,548 fuel transactions · load_required = true on ALL of them · load_id on ZERO ·
 *   load_exemption_reason = 'relay_ingest_no_load_link' on 1,548 of 1,548 — a single constant.
 * The control is therefore 100% escaped and cost-per-load attribution does not exist.
 *
 * THE CAUSE IS NOT THE CODE, and this guard does not pretend otherwise. relay-fuel-canonical-bridge.ts
 * genuinely calls resolveLoadId(unit, driver, timestamp) and only writes the exemption when that
 * returns null. It returns null every time because the loads are not there: mdata.loads holds FOUR
 * non-deleted rows whose stops span 2026-06-04..2026-06-29, against fuel spanning 2026-03-03..2026-08-03.
 * You cannot attribute five months of fuel to twenty-five days of loads.
 *
 * WHY A GUARD ANYWAY. An escape hatch that covers 100% of rows is not a control — it is a control
 * reported as satisfied while measuring nothing, and that is the failure mode this project treats as
 * most dangerous. Backfilling the FKs is NOT the fix and is explicitly forbidden: nothing in the data
 * says which load a given June fuel purchase belongs to, so any populated value would be invented.
 * The fix is upstream — loads must actually be recorded — and this assertion is what makes the gap
 * visible until they are, instead of it being rediscovered in six months.
 *
 * SCOPE: asserts the SHAPE of the control, not a coverage percentage. It fails when one exemption
 * reason accounts for every row, which is the vacuous case. It stays green the moment attribution is
 * partially real, so it never blocks honest progress.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

/** Below this, a single reason is unremarkable rather than evidence of a vacuous control. */
export const MIN_ROWS_TO_JUDGE = 50;

export function isVacuousExemption(total: number, topReasonCount: number): boolean {
  if (total < MIN_ROWS_TO_JUDGE) return false;
  return topReasonCount === total;
}

describeIntegration("LINK-F01 fuel load-attribution control is not vacuous (real Postgres)", () => {
  let db: pg.Client;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    // Session-scoped is safe here: a dedicated pg.Client on the DIRECT endpoint. Over the -pooler
    // endpoint it would not survive between statements and FORCE-RLS would return zero rows silently
    // (DB-F01) — which is why the discriminator below refuses to judge on an unreadable table.
    await db.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  });

  afterAll(async () => {
    await db?.end();
  });

  it("a single exemption reason must not account for EVERY fuel transaction", async () => {
    const { rows } = await db.query<{ total: string; live: string; top_reason: string | null; top_count: string }>(`
      WITH t AS (SELECT count(*)::bigint AS total FROM fuel.fuel_transactions),
           l AS (SELECT COALESCE(n_live_tup,0)::bigint AS live FROM pg_stat_user_tables
                  WHERE schemaname='fuel' AND relname='fuel_transactions'),
           r AS (SELECT load_exemption_reason AS reason, count(*)::bigint AS c
                   FROM fuel.fuel_transactions
                  WHERE load_exemption_reason IS NOT NULL
                  GROUP BY 1 ORDER BY 2 DESC LIMIT 1)
      SELECT t.total::text, l.live::text,
             (SELECT reason FROM r) AS top_reason,
             COALESCE((SELECT c FROM r),0)::text AS top_count
        FROM t, l
    `);
    const r = rows[0];
    const total = Number(r.total);
    const live = Number(r.live);

    // DB-F01 discriminator: if RLS masked the table, "no vacuous exemption" would be a false pass.
    if (live > 0) {
      expect(
        total >= live * 0.9,
        `fuel.fuel_transactions: only ${total} of ~${live} rows visible — the RLS bypass did not take, so this result is not proof`
      ).toBe(true);
    }

    const topCount = Number(r.top_count);
    expect(
      isVacuousExemption(total, topCount),
      `load_exemption_reason='${r.top_reason}' covers ${topCount} of ${total} fuel transactions — every ` +
        `single one. G18 requires fuel to FK to a load; an escape hatch that covers 100% of rows is not ` +
        `a control, it is a control reported as satisfied while measuring nothing. Do NOT fix this by ` +
        `populating load_id: nothing in the data says which load a purchase belongs to, so any value ` +
        `would be invented. The gap is upstream — loads must actually be recorded.`
    ).toBe(false);
  });
});
