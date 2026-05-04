import crypto from "node:crypto";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const createdUserIds = [];
const createdSessionIds = [];
const createdAccessPairs = [];
const createdCustomerIds = [];
const createdVendorIds = [];
const createdLocationIds = [];
const createdUnitIds = [];
const createdEquipmentIds = [];
const port = Number(process.env.MULTITENANT_VERIFY_PORT || 3102);
const apiBase = `http://127.0.0.1:${port}`;

let serverProcess = null;

async function runWithBypass(client, fn) {
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

async function runAsUser(client, userId, fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function pass(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name} -> ${String(error?.message || error)}`);
    return false;
  }
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/_healthcheck`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("backend healthcheck did not become ready");
}

async function startServer(cwd) {
  serverProcess = spawn("npx", ["tsx", "apps/backend/src/index.ts"], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL,
      DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL,
      OAUTH_GOOGLE_CLIENT_ID: process.env.OAUTH_GOOGLE_CLIENT_ID || "verify-client-id",
      OAUTH_GOOGLE_CLIENT_SECRET: process.env.OAUTH_GOOGLE_CLIENT_SECRET || "verify-client-secret",
      OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI || "http://localhost:3000/api/v1/auth/google/callback",
    },
    stdio: "pipe",
  });

  serverProcess.stdout?.on("data", (data) => {
    const text = String(data);
    if (text.trim()) console.log(`[server] ${text.trim()}`);
  });
  serverProcess.stderr?.on("data", (data) => {
    const text = String(data);
    if (text.trim()) console.error(`[server-err] ${text.trim()}`);
  });

  await waitForHealth(apiBase);
}

async function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!serverProcess.killed) serverProcess.kill("SIGKILL");
}

const client = await pool.connect();
const results = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const companiesRes = await client.query(
      `SELECT id, code, is_active, deactivated_at FROM org.companies WHERE code IN ('TRK', 'TRANSP', 'USMCA')`
    );
    const companiesByCode = new Map(companiesRes.rows.map((row) => [row.code, row]));
    const trk = companiesByCode.get("TRK");
    const transp = companiesByCode.get("TRANSP");
    const usmca = companiesByCode.get("USMCA");
    if (!trk || !transp || !usmca) {
      throw new Error("Expected TRK, TRANSP, USMCA companies to exist");
    }

    const ownerRes = await client.query(
      `SELECT id FROM identity.users WHERE email = 'tioperfumes07@gmail.com' LIMIT 1`
    );
    if (ownerRes.rows.length === 0) {
      throw new Error("Owner user tioperfumes07@gmail.com not found");
    }

    return {
      ownerUserId: String(ownerRes.rows[0].id),
      trkCompanyId: String(trk.id),
      transpCompanyId: String(transp.id),
      usmcaCompanyId: String(usmca.id),
      usmcaIsActive: Boolean(usmca.is_active),
      usmcaDeactivatedAt: usmca.deactivated_at,
    };
  });

  const ownerSessionId = `mt_owner_${suffix}`;
  await runWithBypass(client, async () => {
    await client.query(`DELETE FROM identity.sessions WHERE id = $1`, [ownerSessionId]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [
      ownerSessionId,
      refs.ownerUserId,
    ]);
  });
  createdSessionIds.push(ownerSessionId);

  await startServer(process.cwd());

  results.push(
    await pass("Owner user (Jorge) sees only active companies via /api/v1/org/me/companies", async () => {
      const response = await fetch(`${apiBase}/api/v1/org/me/companies`, {
        headers: {
          Cookie: `ih35_session=${ownerSessionId}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Expected 200, got ${response.status}`);
      }
      const payload = await response.json();
      const codes = new Set((payload.companies ?? []).map((row) => row.code));
      if (!codes.has("TRK") || !codes.has("TRANSP") || codes.has("USMCA")) {
        throw new Error(`Expected TRK/TRANSP only, got ${Array.from(codes).join(",")}`);
      }
    })
  );

  results.push(
    await pass("Owner user has access to all 3 companies via org.user_accessible_company_ids()", async () => {
      await runAsUser(client, refs.ownerUserId, async () => {
        const res = await client.query(
          `SELECT array_agg(c.code ORDER BY c.code) AS codes
           FROM org.companies c
           WHERE c.id IN (SELECT org.user_accessible_company_ids())`
        );
        const codes = res.rows[0]?.codes ?? [];
        const got = new Set(codes);
        if (!got.has("TRK") || !got.has("TRANSP") || !got.has("USMCA")) {
          throw new Error(`Expected all three company codes, got ${codes.join(",")}`);
        }
      });
    })
  );

  results.push(
    await pass("USMCA company exists and is_active=false", async () => {
      if (refs.usmcaIsActive !== false) {
        throw new Error("USMCA should be inactive");
      }
      if (refs.usmcaDeactivatedAt !== null) {
        throw new Error("USMCA should be inactive via is_active=false, not deactivated_at");
      }
    })
  );

  results.push(
    await pass("Backfilled operating + asset company IDs are present", async () => {
      await runWithBypass(client, async () => {
        const counts = await client.query(
          `
            SELECT
              (SELECT count(*)::int FROM mdata.customers WHERE operating_company_id IS NULL) AS customers_missing_company,
              (SELECT count(*)::int FROM mdata.vendors WHERE operating_company_id IS NULL) AS vendors_missing_company,
              (SELECT count(*)::int FROM mdata.locations WHERE operating_company_id IS NULL) AS locations_missing_company,
              (SELECT count(*)::int FROM mdata.units WHERE owner_company_id IS NULL) AS units_missing_owner,
              (SELECT count(*)::int FROM mdata.equipment WHERE owner_company_id IS NULL) AS equipment_missing_owner
          `
        );
        const row = counts.rows[0];
        if ((row.customers_missing_company ?? 0) !== 0) throw new Error("Found customers without operating_company_id");
        if ((row.vendors_missing_company ?? 0) !== 0) throw new Error("Found vendors without operating_company_id");
        if ((row.locations_missing_company ?? 0) !== 0) throw new Error("Found locations without operating_company_id");
        if ((row.units_missing_owner ?? 0) !== 0) throw new Error("Found units without owner_company_id");
        if ((row.equipment_missing_owner ?? 0) !== 0) throw new Error("Found equipment without owner_company_id");
      });
    })
  );

  const tempUser = await runWithBypass(client, async () => {
    const userRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role, default_company_id)
        VALUES ($1, $2, 'Manager', $3)
        RETURNING id
      `,
      [`mt-user-${suffix}@example.com`, `mt-user-${suffix}`, refs.transpCompanyId]
    );
    const userId = String(userRes.rows[0].id);
    createdUserIds.push(userId);

    await client.query(
      `
        INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, company_id) DO NOTHING
      `,
      [userId, refs.transpCompanyId, refs.ownerUserId]
    );
    createdAccessPairs.push({ userId, companyId: refs.transpCompanyId });
    return { userId };
  });

  const fixtureRows = await runWithBypass(client, async () => {
    const customerRes = await client.query(
      `
        INSERT INTO mdata.customers (customer_name, customer_code, operating_company_id, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $4)
        RETURNING id
      `,
      [`USMCA Customer ${suffix}`, `USMCA-CUST-${suffix}`, refs.usmcaCompanyId, refs.ownerUserId]
    );
    const vendorRes = await client.query(
      `
        INSERT INTO mdata.vendors (vendor_name, vendor_code, vendor_type, operating_company_id, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, 'Other', $3, $4, $4)
        RETURNING id
      `,
      [`USMCA Vendor ${suffix}`, `USMCA-VEND-${suffix}`, refs.usmcaCompanyId, refs.ownerUserId]
    );
    const locationRes = await client.query(
      `
        INSERT INTO mdata.locations (location_name, location_code, location_type, operating_company_id, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, 'Other', $3, $4, $4)
        RETURNING id
      `,
      [`USMCA Location ${suffix}`, `USMCA-LOC-${suffix}`, refs.usmcaCompanyId, refs.ownerUserId]
    );
    const unitVisibleRes = await client.query(
      `
        INSERT INTO mdata.units (
          unit_number, vin, status, owner_company_id, currently_leased_to_company_id, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'InService', $3, $4, $5, $5)
        RETURNING id
      `,
      [`MT-UNIT-VIS-${suffix}`, `MTVINVIS${suffix}`, refs.trkCompanyId, refs.transpCompanyId, refs.ownerUserId]
    );
    const unitHiddenRes = await client.query(
      `
        INSERT INTO mdata.units (
          unit_number, vin, status, owner_company_id, currently_leased_to_company_id, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'InService', $3, $4, $5, $5)
        RETURNING id
      `,
      [`MT-UNIT-HID-${suffix}`, `MTVINHID${suffix}`, refs.trkCompanyId, refs.usmcaCompanyId, refs.ownerUserId]
    );
    const equipmentVisibleRes = await client.query(
      `
        INSERT INTO mdata.equipment (
          equipment_number, equipment_type, status, owner_company_id, currently_leased_to_company_id, created_by_user_id, updated_by_user_id
        ) VALUES ($1, 'Flatbed', 'InService', $2, $3, $4, $4)
        RETURNING id
      `,
      [`MT-EQP-VIS-${suffix}`, refs.trkCompanyId, refs.transpCompanyId, refs.ownerUserId]
    );
    const equipmentHiddenRes = await client.query(
      `
        INSERT INTO mdata.equipment (
          equipment_number, equipment_type, status, owner_company_id, currently_leased_to_company_id, created_by_user_id, updated_by_user_id
        ) VALUES ($1, 'Flatbed', 'InService', $2, $3, $4, $4)
        RETURNING id
      `,
      [`MT-EQP-HID-${suffix}`, refs.trkCompanyId, refs.usmcaCompanyId, refs.ownerUserId]
    );

    return {
      usmcaCustomerId: String(customerRes.rows[0].id),
      usmcaVendorId: String(vendorRes.rows[0].id),
      usmcaLocationId: String(locationRes.rows[0].id),
      unitVisibleId: String(unitVisibleRes.rows[0].id),
      unitHiddenId: String(unitHiddenRes.rows[0].id),
      equipmentVisibleId: String(equipmentVisibleRes.rows[0].id),
      equipmentHiddenId: String(equipmentHiddenRes.rows[0].id),
    };
  });

  createdCustomerIds.push(fixtureRows.usmcaCustomerId);
  createdVendorIds.push(fixtureRows.usmcaVendorId);
  createdLocationIds.push(fixtureRows.usmcaLocationId);
  createdUnitIds.push(fixtureRows.unitVisibleId, fixtureRows.unitHiddenId);
  createdEquipmentIds.push(fixtureRows.equipmentVisibleId, fixtureRows.equipmentHiddenId);

  results.push(
    await pass("Customer/Vendor/Location queries respect operating company scoping", async () => {
      await runAsUser(client, tempUser.userId, async () => {
        const customerRes = await client.query(`SELECT id FROM mdata.customers WHERE id = $1`, [fixtureRows.usmcaCustomerId]);
        const vendorRes = await client.query(`SELECT id FROM mdata.vendors WHERE id = $1`, [fixtureRows.usmcaVendorId]);
        const locationRes = await client.query(`SELECT id FROM mdata.locations WHERE id = $1`, [fixtureRows.usmcaLocationId]);
        if (customerRes.rowCount !== 0 || vendorRes.rowCount !== 0 || locationRes.rowCount !== 0) {
          throw new Error("User with TRANSP access should not read USMCA operating records");
        }
      });
    })
  );

  results.push(
    await pass("Unit/Equipment queries allow owner-or-leased company visibility", async () => {
      await runAsUser(client, tempUser.userId, async () => {
        const unitVisible = await client.query(`SELECT id FROM mdata.units WHERE id = $1`, [fixtureRows.unitVisibleId]);
        const unitHidden = await client.query(`SELECT id FROM mdata.units WHERE id = $1`, [fixtureRows.unitHiddenId]);
        const equipmentVisible = await client.query(`SELECT id FROM mdata.equipment WHERE id = $1`, [fixtureRows.equipmentVisibleId]);
        const equipmentHidden = await client.query(`SELECT id FROM mdata.equipment WHERE id = $1`, [fixtureRows.equipmentHiddenId]);
        if (unitVisible.rowCount !== 1 || equipmentVisible.rowCount !== 1) {
          throw new Error("Expected visibility when leased to accessible company");
        }
        if (unitHidden.rowCount !== 0 || equipmentHidden.rowCount !== 0) {
          throw new Error("Expected hidden rows when neither owner nor leased company is accessible");
        }
      });
    })
  );

  results.push(
    await pass("Cross-company contamination blocked (TRANSP-only user cannot read USMCA customer)", async () => {
      await runAsUser(client, tempUser.userId, async () => {
        const res = await client.query(`SELECT id FROM mdata.customers WHERE id = $1`, [fixtureRows.usmcaCustomerId]);
        if (res.rowCount !== 0) throw new Error("Expected rowCount=0 for USMCA customer");
      });
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String(error?.message || error)}`);
  results.push(false);
} finally {
  await stopServer();
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdEquipmentIds.length > 0) {
        await client.query(`DELETE FROM mdata.equipment WHERE id = ANY($1::uuid[])`, [createdEquipmentIds]);
      }
      if (createdUnitIds.length > 0) {
        await client.query(`DELETE FROM mdata.units WHERE id = ANY($1::uuid[])`, [createdUnitIds]);
      }
      if (createdLocationIds.length > 0) {
        await client.query(`DELETE FROM mdata.locations WHERE id = ANY($1::uuid[])`, [createdLocationIds]);
      }
      if (createdVendorIds.length > 0) {
        await client.query(`DELETE FROM mdata.vendors WHERE id = ANY($1::uuid[])`, [createdVendorIds]);
      }
      if (createdCustomerIds.length > 0) {
        await client.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [createdCustomerIds]);
      }
      if (createdAccessPairs.length > 0) {
        for (const pair of createdAccessPairs) {
          await client.query(`DELETE FROM org.user_company_access WHERE user_id = $1 AND company_id = $2`, [pair.userId, pair.companyId]);
        }
      }
      if (createdSessionIds.length > 0) {
        await client.query(`DELETE FROM identity.sessions WHERE id = ANY($1::text[])`, [createdSessionIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
      console.log("PASS: cleanup multi-tenant fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup multi-tenant fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: multi-tenant verification complete.");
  process.exit(0);
}

console.error("FAIL: multi-tenant verification failed.");
process.exit(1);
