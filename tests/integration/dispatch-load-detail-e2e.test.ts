import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerDispatchLoadRoutes } from "../../apps/backend/src/dispatch/loads.routes";
import { buildPgClientConfig } from "../../apps/backend/src/lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../apps/backend/test-helpers/constants";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app";
import { testAuthHeaders } from "../../apps/backend/test-helpers/auth-fixture";

// CI GUARD for GUARD-CODER Block 1 (2026-06-24): GET /api/v1/dispatch/loads/:id must return 200, NOT 500.
// The load-detail SQL previously joined `mdata.equipment te ON te.id = l.trailer_id` — a column that does NOT
// exist on mdata.loads / the dispatch view — which 500'd (42703) every load-detail fetch and cascaded into the
// cancel-500 + counted-but-empty Cancelled column. This test seeds a real load and asserts a 200 so the
// missing-column regression can never reach prod again. CI-gated like the other integration e2es.
const describeE2E = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeE2E("dispatch load-detail — E2E (real DB, Block 1 trailer_id 500 guard)", () => {
  let app: FastifyInstance;
  let client: pg.Client;
  let companyId: string;
  let loadId: string;
  let customerId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required for dispatch load-detail e2e");
    client = new pg.Client(buildPgClientConfig(cs));
    await client.connect();
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const suffix = randomUUID().slice(0, 8);
    const cust = await client.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`Block1 LoadDetail ${suffix}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    const load = await client.query<{ id: string }>(
      `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid) RETURNING id`,
      [companyId, `B1-${suffix}`, customerId, TEST_OWNER_USER_ID]
    );
    loadId = load.rows[0]!.id;
    await client.query("COMMIT");

    app = await createIntegrationApp(async (a) => {
      await registerDispatchLoadRoutes(a);
    });
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
    }
    await app?.close();
    await client?.end();
  });

  it("GET /api/v1/dispatch/loads/:id returns 200 (no l.trailer_id 42703), with trailer fields present", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/loads/${loadId}?operating_company_id=${companyId}`,
      headers: { ...testAuthHeaders() },
    });
    expect(res.statusCode, `expected 200, got ${res.statusCode}: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body.id).toBe(loadId);
    // Response shape preserved: both trailer keys present (honestly null — no trailer↔load link persisted).
    expect(body).toHaveProperty("trailer_equipment_type");
    expect(body).toHaveProperty("trailer_number");
    expect(body.trailer_equipment_type).toBeNull();
  });
});
