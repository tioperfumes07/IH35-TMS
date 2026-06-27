/**
 * mdata.drivers.full_name phantom-column guard (real Postgres)
 *
 * 5 backend queries selected `d.full_name` from `mdata.drivers` (FROM/JOIN mdata.drivers d) — but
 * mdata.drivers has NO full_name column (verified vs prod-copy schema); only certain VIEWS expose a
 * CONCAT_WS(first_name,last_name) AS full_name. Every one of those queries 42703'd on execution
 * (settlements/approval, drivers/document-alerts ×7, search indexer, dispatch pre-dispatch-validator,
 * safety cert-monitor). Fix replaced them with CONCAT_WS(' ', d.first_name, d.last_name).
 *
 * This guard: (1) asserts mdata.drivers still has NO full_name (so a future query can't reintroduce the
 * phantom thinking it exists), and (2) runs the replacement expression to prove it's valid. Harness from
 * accounting/__tests__/bill-expense-lines-rls.db.test.ts.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("mdata.drivers full_name phantom (real schema)", () => {
  let db: pg.Client;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
  });

  afterAll(async () => {
    if (db) await db.end().catch(() => {});
  });

  it("mdata.drivers has NO full_name column (the phantom that 500'd 5 queries)", async () => {
    const res = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='drivers' AND column_name='full_name'`
    );
    expect(Number(res.rows[0].n)).toBe(0); // confirmed absent → never SELECT d.full_name from mdata.drivers
  });

  it("the replacement CONCAT_WS(first_name,last_name) runs against real schema (no 42703)", async () => {
    const res = await db.query<{ driver_name: string }>(
      "SELECT CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name FROM mdata.drivers d LIMIT 1"
    );
    expect(Array.isArray(res.rows)).toBe(true);
  });
});
