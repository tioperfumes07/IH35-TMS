import crypto from "node:crypto";
import dotenv from "dotenv";
import Fastify from "fastify";
import pg from "pg";

dotenv.config();
if (!process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
}
process.env.OAUTH_GOOGLE_CLIENT_ID = process.env.OAUTH_GOOGLE_CLIENT_ID || "verify-client-id";
process.env.OAUTH_GOOGLE_CLIENT_SECRET = process.env.OAUTH_GOOGLE_CLIENT_SECRET || "verify-client-secret";
process.env.OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || "http://localhost/verify-callback";

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const createdUserIds: string[] = [];
const createdDriverIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdLoadIds: string[] = [];
const createdAccessPairs: Array<{ userId: string; companyId: string }> = [];
const userById = new Map<string, { uuid: string; email: string | null; role: string }>();
const { registerLoadRoutes } = await import("../apps/backend/src/mdata/loads.routes.js");

async function runWithBypass<T>(client: pg.PoolClient, fn: () => Promise<T>) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function pass(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name} -> ${String((error as Error)?.message || error)}`);
    return false;
  }
}

const app = Fastify();
app.decorateRequest("user", null);
app.decorateRequest("session", null);
app.addHook("preHandler", async (req) => {
  const userId = String(req.headers["x-test-user-id"] ?? "");
  const user = userById.get(userId) ?? null;
  req.user = user;
  req.session = user ? { id: `test-session-${user.uuid}` } : null;
});
await registerLoadRoutes(app);

const client = await pool.connect();
const results: boolean[] = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const companiesRes = await client.query<{ id: string; code: string }>(`SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'TRK')`);
    const transpCompanyId = companiesRes.rows.find((row) => row.code === "TRANSP")?.id;
    const trkCompanyId = companiesRes.rows.find((row) => row.code === "TRK")?.id;
    if (!transpCompanyId || !trkCompanyId) throw new Error("Expected TRANSP and TRK companies");

    const ownerRes = await client.query<{ id: string }>(`SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1`);
    if (ownerRes.rows.length === 0) throw new Error("owner user missing");
    const ownerUserId = ownerRes.rows[0].id;

    const managerARes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Manager',$3) RETURNING id`,
      [`dispatch-mgr-a-${suffix}@example.com`, `dispatch-mgr-a-${suffix}`, transpCompanyId]
    );
    const managerBRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Manager',$3) RETURNING id`,
      [`dispatch-mgr-b-${suffix}@example.com`, `dispatch-mgr-b-${suffix}`, trkCompanyId]
    );
    const driverUserRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
      [`dispatch-driver-${suffix}@example.com`, `dispatch-driver-${suffix}`, transpCompanyId]
    );
    createdUserIds.push(managerARes.rows[0].id, managerBRes.rows[0].id, driverUserRes.rows[0].id);

    for (const pair of [
      { userId: managerARes.rows[0].id, companyId: transpCompanyId },
      { userId: managerBRes.rows[0].id, companyId: trkCompanyId },
      { userId: driverUserRes.rows[0].id, companyId: transpCompanyId },
    ]) {
      await client.query(
        `INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO NOTHING`,
        [pair.userId, pair.companyId, ownerUserId]
      );
      createdAccessPairs.push(pair);
    }

    const customerARes = await client.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, customer_code, operating_company_id, created_by_user_id, updated_by_user_id) VALUES ($1,$2,$3,$4,$4) RETURNING id`,
      [`Dispatch Customer A ${suffix}`, `DCA-${suffix}`, transpCompanyId, ownerUserId]
    );
    const customerBRes = await client.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, customer_code, operating_company_id, created_by_user_id, updated_by_user_id) VALUES ($1,$2,$3,$4,$4) RETURNING id`,
      [`Dispatch Customer B ${suffix}`, `DCB-${suffix}`, trkCompanyId, ownerUserId]
    );
    createdCustomerIds.push(customerARes.rows[0].id, customerBRes.rows[0].id);

    const driverRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.drivers (identity_user_id, first_name, last_name, phone, status, created_by_user_id, updated_by_user_id)
        VALUES ($1,$2,$3,$4,'Active',$5,$5)
        RETURNING id
      `,
      [driverUserRes.rows[0].id, "Dispatch", "Driver", `+1956${Math.floor(1000000 + Math.random() * 9000000)}`, ownerUserId]
    );
    createdDriverIds.push(driverRes.rows[0].id);

    userById.set(managerARes.rows[0].id, { uuid: managerARes.rows[0].id, email: null, role: "Manager" });
    userById.set(managerBRes.rows[0].id, { uuid: managerBRes.rows[0].id, email: null, role: "Manager" });
    userById.set(driverUserRes.rows[0].id, { uuid: driverUserRes.rows[0].id, email: null, role: "Driver" });

    return {
      ownerUserId,
      managerAId: managerARes.rows[0].id,
      managerBId: managerBRes.rows[0].id,
      driverUserId: driverUserRes.rows[0].id,
      driverId: driverRes.rows[0].id,
      companyAId: transpCompanyId,
      companyBId: trkCompanyId,
      customerAId: customerARes.rows[0].id,
      customerBId: customerBRes.rows[0].id,
    };
  });

  results.push(
    await pass("POST /api/v1/mdata/loads creates load + 2 stops atomically", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/mdata/loads",
        headers: { "x-test-user-id": refs.managerAId },
        payload: {
          operating_company_id: refs.companyAId,
          customer_id: refs.customerAId,
          rate_total_cents: 145000,
          notes: "dispatch verify create",
          pickup: {
            city: "Laredo",
            state: "TX",
            country: "USA",
            scheduled_arrival_at: new Date().toISOString(),
          },
          delivery: {
            city: "Dallas",
            state: "TX",
            country: "USA",
            scheduled_arrival_at: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
      });
      if (response.statusCode !== 201) throw new Error(`unexpected status ${response.statusCode}`);
      const body = response.json() as { id: string; stops?: Array<{ id: string }> };
      if (!body.id) throw new Error("missing load id");
      createdLoadIds.push(body.id);
      const stopsRes = await runWithBypass(client, async () => client.query<{ cnt: number }>(`SELECT count(*)::int AS cnt FROM mdata.load_stops WHERE load_id = $1`, [body.id]));
      if (Number(stopsRes.rows[0]?.cnt ?? 0) !== 2) throw new Error("expected exactly 2 stops after create");
    })
  );

  const assignedLoad = await runWithBypass(client, async () => {
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.loads (
          operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
          assigned_primary_driver_id, dispatcher_user_id, notes
        )
        VALUES ($1,$2,$3,'assigned',120000,'USD',$4,$5,$6)
        RETURNING id
      `,
      [refs.companyAId, `LTRANSP-${suffix}-A001`, refs.customerAId, refs.driverId, refs.managerAId, "assigned fixture"]
    );
    createdLoadIds.push(res.rows[0].id);
    return res.rows[0].id;
  });

  const companyBLoad = await runWithBypass(client, async () => {
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.loads (
          operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
          dispatcher_user_id, notes
        )
        VALUES ($1,$2,$3,'booked',99000,'USD',$4,$5)
        RETURNING id
      `,
      [refs.companyBId, `LTRK-${suffix}-B001`, refs.customerBId, refs.managerBId, "company b fixture"]
    );
    createdLoadIds.push(res.rows[0].id);
    return res.rows[0].id;
  });

  results.push(
    await pass("GET /api/v1/mdata/loads with filters returns expected subset", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/mdata/loads?status=assigned&driver_id=${refs.driverId}&operating_company_id=${refs.companyAId}`,
        headers: { "x-test-user-id": refs.managerAId },
      });
      if (response.statusCode !== 200) throw new Error(`unexpected status ${response.statusCode}: ${response.body}`);
      const body = response.json() as { loads: Array<{ id: string }>; total_count: number };
      if ((body.loads ?? []).length < 1) throw new Error("expected assigned load in filtered list");
      const hasAssignedFixture = body.loads.some((row) => row.id === assignedLoad);
      if (!hasAssignedFixture) throw new Error("assigned fixture load missing from filtered response");
      if ((body.total_count ?? 0) < 1) throw new Error("total_count should be >= 1");
    })
  );

  results.push(
    await pass("PATCH /api/v1/mdata/loads/:id/status allows valid transitions and writes audit", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/mdata/loads",
        headers: { "x-test-user-id": refs.managerAId },
        payload: {
          operating_company_id: refs.companyAId,
          customer_id: refs.customerAId,
          status: "booked",
          rate_total_cents: 111000,
          notes: "status-transition-fixture",
        },
      });
      if (created.statusCode !== 201) throw new Error("failed to create transition fixture");
      const createdBody = created.json() as { id: string };
      createdLoadIds.push(createdBody.id);

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/mdata/loads/${createdBody.id}/status`,
        headers: { "x-test-user-id": refs.managerAId },
        payload: { new_status: "assigned" },
      });
      if (patchRes.statusCode !== 200) throw new Error(`status endpoint returned ${patchRes.statusCode}`);

      await client.query("RESET ROLE");
      const auditRes = await client.query<{ cnt: number }>(
        `
          SELECT count(*)::int AS cnt
          FROM audit.audit_events
          WHERE event_class = 'mdata.loads.status_changed'
            AND payload->>'resource_id' = $1
        `,
        [createdBody.id]
      );
      await client.query("SET ROLE ih35_app");
      if (Number(auditRes.rows[0]?.cnt ?? 0) < 1) throw new Error("status_changed audit event missing");
    })
  );

  results.push(
    await pass("PATCH status rejects invalid transitions (completed/closed -> pending)", async () => {
      const closedLoad = await runWithBypass(client, async () => {
        const res = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.loads (
              operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code, dispatcher_user_id, notes
            )
            VALUES ($1,$2,$3,'closed',120000,'USD',$4,$5)
            RETURNING id
          `,
          [refs.companyAId, `LTRANSP-${suffix}-C001`, refs.customerAId, refs.managerAId, "closed fixture"]
        );
        createdLoadIds.push(res.rows[0].id);
        return res.rows[0].id;
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/mdata/loads/${closedLoad}/status`,
        headers: { "x-test-user-id": refs.managerAId },
        payload: { new_status: "draft" },
      });
      if (response.statusCode !== 400) throw new Error(`expected 400, got ${response.statusCode}`);
      const body = response.json() as { error?: string };
      if (body.error !== "invalid_status_transition") throw new Error("invalid transition error code mismatch");
    })
  );

  results.push(
    await pass("RLS: manager Company A cannot see Company B loads", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/mdata/loads",
        headers: { "x-test-user-id": refs.managerAId },
      });
      if (response.statusCode !== 200) throw new Error(`unexpected status ${response.statusCode}: ${response.body}`);
      const body = response.json() as { loads: Array<{ id: string }> };
      const seesCompanyBLoad = (body.loads ?? []).some((row) => row.id === companyBLoad);
      if (seesCompanyBLoad) throw new Error("manager A should not see company B load");
    })
  );

  results.push(
    await pass("Driver sees only loads where assigned", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/mdata/loads",
        headers: { "x-test-user-id": refs.driverUserId },
      });
      if (response.statusCode !== 200) throw new Error(`unexpected status ${response.statusCode}: ${response.body}`);
      const body = response.json() as { loads: Array<{ id: string }> };
      if ((body.loads ?? []).length === 0) throw new Error("driver should see at least one assigned load");
      const hasOnlyAssigned = body.loads.every((row) => row.id === assignedLoad);
      if (!hasOnlyAssigned) throw new Error("driver can see non-assigned load(s)");
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String((error as Error)?.message || error)}`);
  results.push(false);
} finally {
  try {
    await app.close();
  } catch {
    // ignore close error
  }
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdLoadIds.length > 0) await client.query(`DELETE FROM mdata.loads WHERE id = ANY($1::uuid[])`, [createdLoadIds]);
      if (createdDriverIds.length > 0) await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      if (createdCustomerIds.length > 0) await client.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [createdCustomerIds]);
      for (const pair of createdAccessPairs) {
        await client.query(`DELETE FROM org.user_company_access WHERE user_id = $1 AND company_id = $2`, [pair.userId, pair.companyId]);
      }
      if (createdUserIds.length > 0) await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      await client.query("COMMIT");
      console.log("PASS: cleanup dispatch-board fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup dispatch-board fixtures -> ${String((error as Error)?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: dispatch board verification complete.");
  process.exit(0);
}

console.error("FAIL: dispatch board verification failed.");
process.exit(1);
