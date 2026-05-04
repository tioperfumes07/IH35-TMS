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
const port = Number(process.env.DRIVER_PROFILE_VERIFY_PORT || 3104);
const apiBase = `http://127.0.0.1:${port}`;

const createdUserIds = [];
const createdSessionIds = [];
const createdDriverIds = [];
const createdQualificationIds = [];
const createdAuthorizationIds = [];
const createdUserAccessIds = [];

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

function isDeniedError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("violates row-level security policy");
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
const verifySource = "BT-1-DRIVER-PROFILE-EXPANSION";

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const ownerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Owner') RETURNING id`,
      [`driver-profile-owner-${suffix}@example.com`, `driver-profile-owner-${suffix}`]
    );
    const driverRoleRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Driver') RETURNING id`,
      [`driver-profile-driver-${suffix}@example.com`, `driver-profile-driver-${suffix}`]
    );
    const managerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`,
      [`driver-profile-manager-${suffix}@example.com`, `driver-profile-manager-${suffix}`]
    );
    const ownerId = String(ownerRes.rows[0].id);
    const driverRoleUserId = String(driverRoleRes.rows[0].id);
    const managerId = String(managerRes.rows[0].id);
    createdUserIds.push(ownerId, driverRoleUserId, managerId);

    const ownerSessionId = `driver_profile_owner_${suffix}`;
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [
      ownerSessionId,
      ownerId,
    ]);
    createdSessionIds.push(ownerSessionId);

    const companyRes = await client.query(`SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'USMCA')`);
    const transpId = String(companyRes.rows.find((row) => row.code === "TRANSP")?.id ?? "");
    const usmcaId = String(companyRes.rows.find((row) => row.code === "USMCA")?.id ?? "");
    if (!transpId || !usmcaId) throw new Error("required companies TRANSP/USMCA were not found");

    const accessRes = await client.query(
      `
        INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [managerId, transpId, ownerId]
    );
    createdUserAccessIds.push(String(accessRes.rows[0].id));

    const equipmentTypeRes = await client.query(
      `SELECT id, code FROM catalogs.equipment_types WHERE code IN ('DRY_VAN', 'FLATBED') AND deactivated_at IS NULL`
    );
    const equipmentTypeId = String(equipmentTypeRes.rows.find((row) => row.code === "DRY_VAN")?.id ?? "");
    const apiEquipmentTypeId = String(equipmentTypeRes.rows.find((row) => row.code === "FLATBED")?.id ?? "");
    if (!equipmentTypeId) throw new Error("DRY_VAN equipment type not found");
    if (!apiEquipmentTypeId) throw new Error("FLATBED equipment type not found");

    const lineItemRes = await client.query(
      `
        SELECT id
        FROM catalogs.equipment_line_item_templates
        WHERE equipment_type_id = $1
          AND code = 'LOADED_MILE'
          AND deactivated_at IS NULL
        LIMIT 1
      `,
      [apiEquipmentTypeId]
    );
    const lineItemTemplateId = String(lineItemRes.rows[0]?.id ?? "");
    if (!lineItemTemplateId) throw new Error("LOADED_MILE line item not found");

    const primaryDriverRes = await client.query(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, 'Active', $4, $4)
        RETURNING id
      `,
      [`DriverProfile-${suffix}`, "Primary", `+1555${suffix.slice(0, 6)}`, ownerId]
    );
    const duplicateCurpDriverRes = await client.query(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, 'Active', $4, $4)
        RETURNING id
      `,
      [`DriverProfile-${suffix}`, "Duplicate", `+1554${suffix.slice(0, 6)}`, ownerId]
    );
    const primaryDriverId = String(primaryDriverRes.rows[0].id);
    const duplicateCurpDriverId = String(duplicateCurpDriverRes.rows[0].id);
    createdDriverIds.push(primaryDriverId, duplicateCurpDriverId);

    return {
      ownerId,
      driverRoleUserId,
      managerId,
      ownerSessionId,
      primaryDriverId,
      duplicateCurpDriverId,
      equipmentTypeId,
      apiEquipmentTypeId,
      lineItemTemplateId,
      transpId,
      usmcaId,
    };
  });

  results.push(
    await pass("Schema has new driver profile columns and tables", async () => {
      await runWithBypass(client, async () => {
        const columnsRes = await client.query(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'mdata'
              AND table_name = 'drivers'
              AND column_name = ANY($1::text[])
          `,
          [[
            "visa_type",
            "visa_number",
            "visa_expires_at",
            "passport_number",
            "passport_expires_at",
            "ine_number",
            "curp",
            "mx_address_line1",
            "mx_address_line2",
            "mx_city",
            "mx_state",
            "mx_postal_code",
            "emergency_contact_name",
            "emergency_contact_relationship",
            "emergency_contact_phone_primary",
            "emergency_contact_phone_alternate",
            "emergency_contact_address",
            "emergency_contact_notes",
          ]]
        );
        if (columnsRes.rows.length !== 18) throw new Error(`expected 18 columns, found ${columnsRes.rows.length}`);

        const tablesRes = await client.query(
          `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'mdata'
              AND table_name = ANY($1::text[])
          `,
          [["driver_equipment_qualifications", "driver_pay_rates", "driver_company_authorizations"]]
        );
        if (tablesRes.rows.length !== 3) throw new Error(`expected 3 tables, found ${tablesRes.rows.length}`);
      });
    })
  );

  results.push(
    await pass("CURP unique constraint rejects duplicates", async () => {
      await runWithBypass(client, async () => {
        const curpValue = `ABCD010101HDFRRS${suffix.slice(0, 2).toUpperCase()}`.slice(0, 18);
        await client.query(`UPDATE mdata.drivers SET curp = $2 WHERE id = $1`, [refs.primaryDriverId, curpValue]);
        try {
          await client.query(`UPDATE mdata.drivers SET curp = $2 WHERE id = $1`, [refs.duplicateCurpDriverId, curpValue]);
          throw new Error("duplicate CURP update unexpectedly succeeded");
        } catch (error) {
          if (error?.code !== "23505") throw error;
        }
      });
    })
  );

  results.push(
    await pass("Owner role can insert equipment qualification", async () => {
      await runAsUser(client, refs.ownerId, async () => {
        const res = await client.query(
          `
            INSERT INTO mdata.driver_equipment_qualifications (
              driver_id, equipment_type_id, qualified_at, created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, CURRENT_DATE, $3, $3)
            RETURNING id
          `,
          [refs.primaryDriverId, refs.equipmentTypeId, refs.ownerId]
        );
        const qualificationId = String(res.rows[0].id);
        createdQualificationIds.push(qualificationId);
      });
    })
  );

  results.push(
    await pass("Driver role cannot insert equipment qualification", async () => {
      await runAsUser(client, refs.driverRoleUserId, async () => {
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_equipment_qualifications (
                driver_id, equipment_type_id, qualified_at, created_by_user_id, updated_by_user_id
              ) VALUES ($1, $2, CURRENT_DATE, $3, $3)
            `,
            [refs.primaryDriverId, refs.equipmentTypeId, refs.driverRoleUserId]
          );
          throw new Error("driver insert unexpectedly succeeded");
        } catch (error) {
          if (!isDeniedError(error)) throw error;
        }
      });
    })
  );

  await startServer(process.cwd());

  let apiQualificationId = "";
  results.push(
    await pass("POST qualification creates qualification and initial rate", async () => {
      const response = await fetch(`${apiBase}/api/v1/mdata/drivers/${refs.primaryDriverId}/qualifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          equipment_type_id: refs.apiEquipmentTypeId,
          qualified_at: "2026-01-01",
          notes: "verify fixture",
          initial_rates: [
            {
              line_item_template_id: refs.lineItemTemplateId,
              amount: 0.55,
              change_reason: "raise",
              change_notes: "initial setup",
            },
          ],
        }),
      });
      if (response.status !== 201) {
        const body = await response.text();
        throw new Error(`expected 201, got ${response.status} body=${body}`);
      }
      const payload = await response.json();
      apiQualificationId = String(payload?.qualification?.id ?? "");
      if (!apiQualificationId) throw new Error("missing qualification id from API");
      createdQualificationIds.push(apiQualificationId);
    })
  );

  results.push(
    await pass("Rate change endpoint creates new row and closes old row", async () => {
      const response = await fetch(`${apiBase}/api/v1/mdata/drivers/${refs.primaryDriverId}/qualifications/${apiQualificationId}/rates/change`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          line_item_template_id: refs.lineItemTemplateId,
          amount: 0.77,
          effective_from: "2026-02-01",
          change_reason: "annual_adjustment",
          change_notes: "verify change",
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`rate change failed ${response.status} body=${body}`);
      }

      await runWithBypass(client, async () => {
        const res = await client.query(
          `
            SELECT id, amount, effective_from, effective_to, previous_rate_id
            FROM mdata.driver_pay_rates
            WHERE driver_qualification_id = $1
              AND line_item_template_id = $2
              AND deactivated_at IS NULL
            ORDER BY effective_from DESC
          `,
          [apiQualificationId, refs.lineItemTemplateId]
        );
        if (res.rows.length < 2) throw new Error("expected at least 2 rate rows");
        const newest = res.rows[0];
        const previous = res.rows[1];
        if (String(newest.amount) !== "0.7700") throw new Error(`expected newest amount 0.7700, got ${newest.amount}`);
        if (!newest.previous_rate_id) throw new Error("expected previous_rate_id on newest row");
        if (String(newest.previous_rate_id) !== String(previous.id)) throw new Error("newest row previous_rate_id mismatch");
        if (!previous.effective_to) throw new Error("previous row effective_to should be closed");
      });
    })
  );

  results.push(
    await pass("Rate history returns rows in descending order", async () => {
      const response = await fetch(
        `${apiBase}/api/v1/mdata/drivers/${refs.primaryDriverId}/qualifications/${apiQualificationId}/rate-history`,
        {
          headers: {
            Cookie: `ih35_session=${refs.ownerSessionId}`,
          },
        }
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`history endpoint failed ${response.status} body=${body}`);
      }
      const payload = await response.json();
      const line = (payload?.line_items ?? []).find((item) => item.line_item_template_id === refs.lineItemTemplateId);
      if (!line || line.history.length < 2) throw new Error("expected 2 history rows");
      const first = new Date(line.history[0].effective_from).getTime();
      const second = new Date(line.history[1].effective_from).getTime();
      if (first < second) throw new Error("history is not sorted descending");
    })
  );

  results.push(
    await pass("POST company authorization succeeds for TRANSP", async () => {
      const response = await fetch(`${apiBase}/api/v1/mdata/drivers/${refs.primaryDriverId}/company-authorizations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          company_id: refs.transpId,
          is_authorized: true,
          notes: "verify transp authorization",
        }),
      });
      if (response.status !== 201) {
        const body = await response.text();
        throw new Error(`expected 201, got ${response.status} body=${body}`);
      }
      const payload = await response.json();
      const authId = String(payload?.authorization?.id ?? "");
      if (!authId) throw new Error("missing authorization id");
      createdAuthorizationIds.push(authId);
    })
  );

  results.push(
    await pass("RLS blocks TRANSP-scoped manager from selecting USMCA authorization", async () => {
      await runWithBypass(client, async () => {
        const inserted = await client.query(
          `
            INSERT INTO mdata.driver_company_authorizations (
              driver_id, company_id, is_authorized, authorized_by_user_id
            ) VALUES ($1, $2, true, $3)
            RETURNING id
          `,
          [refs.primaryDriverId, refs.usmcaId, refs.ownerId]
        );
        createdAuthorizationIds.push(String(inserted.rows[0].id));
      });

      await runAsUser(client, refs.managerId, async () => {
        const visible = await client.query(
          `
            SELECT id
            FROM mdata.driver_company_authorizations
            WHERE driver_id = $1
              AND company_id = $2
              AND deactivated_at IS NULL
          `,
          [refs.primaryDriverId, refs.usmcaId]
        );
        if (visible.rows.length !== 0) throw new Error("manager should not see USMCA authorization row");
      });
    })
  );

  results.push(
    await pass("Audit events emitted for qualification/rates/company authorization", async () => {
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const res = await client.query(
          `
            SELECT event_class, count(*)::int AS cnt
            FROM audit.audit_events
            WHERE source = $1
              AND created_at >= (now() - interval '30 minutes')
              AND (
                payload ->> 'driver_id' = $2
                OR payload ->> 'resource_id' = ANY($3::text[])
                OR payload ->> 'driver_qualification_id' = ANY($4::text[])
              )
              AND event_class = ANY($5::text[])
            GROUP BY event_class
          `,
          [
            verifySource,
            refs.primaryDriverId,
            [refs.primaryDriverId, ...createdQualificationIds, ...createdAuthorizationIds],
            createdQualificationIds,
            [
              "mdata.driver_equipment_qualifications.created",
              "mdata.driver_pay_rates.created",
              "mdata.driver_pay_rates.changed",
              "mdata.driver_company_authorizations.granted",
            ],
          ]
        );
        await client.query("COMMIT");
        const got = new Map(res.rows.map((row) => [row.event_class, Number(row.cnt)]));
        for (const eventClass of [
          "mdata.driver_equipment_qualifications.created",
          "mdata.driver_pay_rates.created",
          "mdata.driver_pay_rates.changed",
          "mdata.driver_company_authorizations.granted",
        ]) {
          if ((got.get(eventClass) ?? 0) < 1) {
            throw new Error(`missing audit event ${eventClass}`);
          }
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
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
      if (createdAuthorizationIds.length > 0) {
        await client.query(`DELETE FROM mdata.driver_company_authorizations WHERE id = ANY($1::uuid[])`, [createdAuthorizationIds]);
      }
      if (createdQualificationIds.length > 0) {
        await client.query(`DELETE FROM mdata.driver_equipment_qualifications WHERE id = ANY($1::uuid[])`, [createdQualificationIds]);
      }
      if (createdDriverIds.length > 0) {
        await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      }
      if (createdUserAccessIds.length > 0) {
        await client.query(`DELETE FROM org.user_company_access WHERE id = ANY($1::uuid[])`, [createdUserAccessIds]);
      }
      if (createdSessionIds.length > 0) {
        await client.query(`DELETE FROM identity.sessions WHERE id = ANY($1::text[])`, [createdSessionIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
      console.log("PASS: cleanup driver profile fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup driver profile fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: driver profile verification complete.");
  process.exit(0);
}

console.error("FAIL: driver profile verification failed.");
process.exit(1);
