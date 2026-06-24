import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listOptimalDriversForLoad } from "../../apps/backend/src/dispatch/driver-optimizer.service";
import { buildPgClientConfig } from "../../apps/backend/src/lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../apps/backend/test-helpers/constants";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture";

// CI GUARD (2026-06-24) — FIX-7, the optimal-drivers 500 (twin of #1444/#1448). The driver-suggestion
// query SELECTed `l.hazmat` (no such column on mdata.loads — hazmat lives in the quicksave_pending_fields
// jsonb) and `l.trailer_type` (prod<->migration drift; absent in a from-migrations DB). Both 42703'd ->
// 500 x8 live. This guard drives the REAL service on a from-migrations DB (ih35_e2e) and asserts it
// returns (no 42703) — the guard GUARD said "should have caught #1444 before prod". It also reads hazmat
// from the jsonb so the COALESCE path is exercised. Old code: throws 42703 (red); fixed: resolves (green).
const describeE2E = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeE2E("optimal-drivers — E2E (real DB, FIX-7 l.hazmat/trailer_type 42703 guard)", () => {
  let client: pg.Client;
  let companyId: string;
  let customerId: string;
  let loadId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required for optimal-drivers e2e");
    client = new pg.Client(buildPgClientConfig(cs));
    await client.connect();
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const suffix = randomUUID().slice(0, 8);
    const cust = await client.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`OptDrivers ${suffix}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    // Seed a load whose hazmat lives in the quicksave_pending_fields jsonb (the real persistence path).
    const load = await client.query<{ id: string }>(
      `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, quicksave_pending_fields)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::jsonb) RETURNING id`,
      [companyId, `OPT-${suffix}`, customerId, TEST_OWNER_USER_ID, JSON.stringify({ hazmat: true })]
    );
    loadId = load.rows[0]!.id;
    await client.query("COMMIT");
  });

  afterAll(async () => {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      await client.query(`DELETE FROM mdata.loads WHERE id = $1::uuid`, [loadId]);
      await client.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerId]);
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK").catch(() => {});
    } finally {
      await client.end().catch(() => {});
    }
  });

  it("returns driver suggestions for a real load without 42703 (l.hazmat / l.trailer_type)", async () => {
    const result = await listOptimalDriversForLoad(TEST_OWNER_USER_ID, {
      operating_company_id: companyId,
      load_id: loadId,
    });
    // Before the fix this threw 42703 (column l.hazmat does not exist). The shape just needs to be a
    // resolved object — the regression we guard is the 500, not the ranking content.
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });
});
