/**
 * PER-TRUCK-CPM-500-FIX smoke guard — proves reports/per-truck-cpm executes (would return 200), i.e. the
 * CPM query references only real relations (no insurance.insurance_policy_units / insurance_policies phantom
 * that threw 42P01). Calls the calculator against a real Postgres and asserts it resolves to an array.
 *
 * Skip is keyed on DB-URL PRESENCE (the build-typecheck lane has no Postgres — a GITHUB_ACTIONS-only gate
 * would run this and hard-fail ECONNREFUSED). Runs only in the integration/DB lane.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { calculatePerTruckCpm } from "../cpm-calculator.service.js";

const HAS_DB_URL = Boolean(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL);
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true" || !HAS_DB_URL);

describeIntegration("per-truck-cpm smoke (real Postgres) — executes without missing-relation 500", () => {
  let db: pg.Client;
  let companyId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig());
    await db.connect();
    await db.query("SET ROLE ih35_app");
  });

  afterAll(async () => {
    if (db) await db.end().catch(() => {});
  });

  it("calculatePerTruckCpm resolves to an array (no 42P01 phantom-relation 500)", async () => {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("SET LOCAL app.operating_company_id = $1", [companyId]);
      const rows = await calculatePerTruckCpm(db, companyId, "2026-01-01", "2026-12-31");
      expect(Array.isArray(rows)).toBe(true);
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  });
});
