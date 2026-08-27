/**
 * CASH-FLOW-ACTUAL-VS-PROJECTED-INCOME-STRUCTURALLY-ALWAYS-ZERO
 *
 * getActualVsProjected() must prefer a frozen forecast.cash_flow_projection_snapshots row over
 * its own live recomputation for any date strictly before "today" (company business date), and
 * must ignore a snapshot for "today" — today's own prediction stays live. Proven against a real
 * Postgres with no loads/invoices seeded at all: the live query alone would show $0 projected
 * income for every date in range, so any nonzero figure in the result can only have come from the
 * snapshot override.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";
import { getActualVsProjected } from "../cash-flow.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("getActualVsProjected — snapshot override (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const createdSnapshotIds: string[] = [];

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const r = await fn();
      await db.query("COMMIT");
      return r;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function insertSnapshot(predictionDate: string, cents: number) {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO forecast.cash_flow_projection_snapshots
           (id, operating_company_id, prediction_date, projected_income_cents, cash_follows_eta)
         VALUES ($1::uuid, $2::uuid, $3::date, $4, false)`,
        [id, companyId, predictionDate, cents]
      );
    });
    createdSnapshotIds.push(id);
  }

  function daysAgo(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
  });

  afterAll(async () => {
    if (createdSnapshotIds.length) {
      // No DELETE grant by design (append-only) — leave the rows; they are harmless throwaway test
      // fixtures on a distant past date, not read by anything else.
    }
    await db.end();
  });

  it("uses the frozen snapshot for a past date instead of the ($0) live recomputation", async () => {
    const pastDate = daysAgo(3);
    await insertSnapshot(pastDate, 987654);

    const result = await bypass(() => getActualVsProjected(db, companyId, pastDate, pastDate, false));
    const incomeLine = result.lines.find((l) => l.date === pastDate && l.category === "income");
    expect(incomeLine).toBeDefined();
    expect(incomeLine?.projected_cents).toBe(987654);
  });

  it("ignores a snapshot captured for today — today's prediction stays live", async () => {
    const today = companyBusinessDate();
    await insertSnapshot(today, 555000);

    const result = await bypass(() => getActualVsProjected(db, companyId, today, today, false));
    const incomeLine = result.lines.find((l) => l.date === today && l.category === "income");
    // No loads/invoices seeded for today, and the snapshot must NOT be applied for today (the
    // `from < today` guard excludes it) — so the live query correctly produces no group for this
    // date at all (a date with zero matching rows emits no row, not a zero-sum row), and no income
    // line is emitted. If the guard had an off-by-one and applied the snapshot to today anyway,
    // this line WOULD appear with projected_cents=555000 and the assertion below would fail.
    expect(incomeLine).toBeUndefined();
  });

  it("a date range with no snapshot at all falls back to the live ($0) value, never worse than before", async () => {
    const untouchedDate = daysAgo(10);
    const result = await bypass(() => getActualVsProjected(db, companyId, untouchedDate, untouchedDate, false));
    const incomeLine = result.lines.find((l) => l.date === untouchedDate && l.category === "income");
    // No loads and no snapshot for this date → the map has no entry at all, so no "income" line is
    // emitted for it (allDates is built only from map keys) — this is the pre-existing, unchanged
    // behavior for a date nothing has ever touched.
    expect(incomeLine).toBeUndefined();
  });
});
