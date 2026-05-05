// @ts-nocheck
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
const port = Number(process.env.CUSTOMER_FULL_PROFILE_VERIFY_PORT || 3107);
const apiBase = `http://127.0.0.1:${port}`;
const verifySource = "BT-1-CUSTOMER-FULL-PROFILE";

const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdContactIds: string[] = [];
const createdVendorIds: string[] = [];
let serverProcess: any = null;

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

async function waitForHealth(baseUrl, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/_healthcheck`);
      if (res.ok) return;
    } catch {
      // ignore while starting
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
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
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
const results: boolean[] = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const ownerRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Owner') RETURNING id`, [
      `cust-full-owner-${suffix}@example.com`,
      `cust-full-owner-${suffix}`,
    ]);
    const managerRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`, [
      `cust-full-manager-${suffix}@example.com`,
      `cust-full-manager-${suffix}`,
    ]);
    const outsiderRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`, [
      `cust-full-outsider-${suffix}@example.com`,
      `cust-full-outsider-${suffix}`,
    ]);

    const ownerId = String(ownerRes.rows[0].id);
    const managerId = String(managerRes.rows[0].id);
    const outsiderId = String(outsiderRes.rows[0].id);
    createdUserIds.push(ownerId, managerId, outsiderId);

    const ownerSessionId = `cust_full_owner_${suffix}`;
    const managerSessionId = `cust_full_manager_${suffix}`;
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [ownerSessionId, ownerId]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [managerSessionId, managerId]);
    createdSessionIds.push(ownerSessionId, managerSessionId);

    const companyARes = await client.query(
      `INSERT INTO org.companies (code, legal_name, short_name, company_type, is_active) VALUES ($1, $2, $3, 'operating_carrier', true) RETURNING id`,
      [`CFA_${suffix.toUpperCase()}`, `Customer Full A ${suffix}`, `CF-A ${suffix}`]
    );
    const companyBRes = await client.query(
      `INSERT INTO org.companies (code, legal_name, short_name, company_type, is_active) VALUES ($1, $2, $3, 'operating_carrier', true) RETURNING id`,
      [`CFB_${suffix.toUpperCase()}`, `Customer Full B ${suffix}`, `CF-B ${suffix}`]
    );
    const companyAId = String(companyARes.rows[0].id);
    const companyBId = String(companyBRes.rows[0].id);
    createdCompanyIds.push(companyAId, companyBId);

    await client.query(`INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1, $2), ($3, $4)`, [managerId, companyAId, outsiderId, companyBId]);
    await client.query(`UPDATE identity.users SET default_company_id = $2 WHERE id = $1`, [managerId, companyAId]);
    await client.query(`UPDATE identity.users SET default_company_id = $2 WHERE id = $1`, [outsiderId, companyBId]);

    return { ownerId, managerId, outsiderId, ownerSessionId, managerSessionId, companyAId, companyBId };
  });

  results.push(
    await pass("Schema: customers table has full-profile columns", async () => {
      await runWithBypass(client, async () => {
        const colsRes = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'mdata' AND table_name = 'customers' AND column_name = ANY($1::text[])`,
          [[
            "tax_id_encrypted",
            "credit_limit",
            "payment_terms_id",
            "status",
            "notes",
            "website",
            "office_phone",
            "fax_phone",
            "main_contact_name",
            "main_contact_title",
            "main_contact_email",
            "main_contact_phone",
            "main_contact_mobile",
            "ar_email",
            "ar_phone",
            "ap_email",
            "ap_phone",
            "free_time_pickup_minutes",
            "free_time_delivery_minutes",
            "detention_rate_per_hour",
            "factoring_eligible",
            "factoring_company_vendor_id",
            "factoring_advance_rate_override",
            "factoring_reserve_pct_override",
            "factoring_recourse_type",
            "factoring_notes",
          ]]
        );
        if (colsRes.rows.length !== 26) throw new Error(`expected 26 columns, got ${colsRes.rows.length}`);
      });
    })
  );

  results.push(
    await pass("Schema: customer_contacts table exists with FK + RLS", async () => {
      await runWithBypass(client, async () => {
        const tableRes = await client.query(
          `SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'mdata' AND c.relname = 'customer_contacts' LIMIT 1`
        );
        if (tableRes.rows.length === 0) throw new Error("customer_contacts missing");
        if (!tableRes.rows[0].rls_enabled || !tableRes.rows[0].force_rls) throw new Error("RLS not enabled/forced");
      });
    })
  );

  let faroVendorId = "";
  let ccgVendorId = "";
  let scopedFactorVendorId = "";

  results.push(
    await pass("Schema: factoring config columns defaults/checks are present", async () => {
      await runWithBypass(client, async () => {
        const rows = await client.query(
          `SELECT column_name, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_schema = 'mdata'
             AND table_name = 'customers'
             AND column_name IN ('factoring_eligible', 'factoring_company_vendor_id', 'factoring_advance_rate_override', 'factoring_reserve_pct_override', 'factoring_recourse_type', 'factoring_notes')`
        );
        if (rows.rows.length !== 6) throw new Error("missing factoring columns");
        const byName = new Map(rows.rows.map((row) => [row.column_name, row]));
        const eligible = byName.get("factoring_eligible");
        if (!eligible) throw new Error("factoring_eligible missing");
        if (eligible.is_nullable !== "NO") throw new Error("factoring_eligible must be NOT NULL");
        if (!String(eligible.column_default ?? "").includes("true")) throw new Error("factoring_eligible default should be true");
      });
    })
  );

  results.push(
    await pass("Schema: idx_customers_factoring_company index exists", async () => {
      await runWithBypass(client, async () => {
        const idxRes = await client.query(
          `SELECT indexname
           FROM pg_indexes
           WHERE schemaname = 'mdata'
             AND tablename = 'customers'
             AND indexname = 'idx_customers_factoring_company'`
        );
        if (idxRes.rows.length !== 1) throw new Error("idx_customers_factoring_company missing");
      });
    })
  );

  results.push(
    await pass("Seed vendors: Faro (TRANSP) and CCG (TRK) exist", async () => {
      await runWithBypass(client, async () => {
        const faroRes = await client.query(
          `SELECT v.id
           FROM mdata.vendors v
           JOIN org.companies c ON c.id = v.operating_company_id
           WHERE v.vendor_name = 'Faro Factoring'
             AND c.code = 'TRANSP'
             AND v.deactivated_at IS NULL
           LIMIT 1`
        );
        const ccgRes = await client.query(
          `SELECT v.id
           FROM mdata.vendors v
           JOIN org.companies c ON c.id = v.operating_company_id
           WHERE v.vendor_name = 'Commercial Credit Group'
             AND c.code = 'TRK'
             AND v.deactivated_at IS NULL
           LIMIT 1`
        );
        faroVendorId = String(faroRes.rows[0]?.id ?? "");
        ccgVendorId = String(ccgRes.rows[0]?.id ?? "");
        if (!faroVendorId) throw new Error("Faro vendor missing for TRANSP");
        if (!ccgVendorId) throw new Error("CCG vendor missing for TRK");
      });
    })
  );

  let customerId = "";
  let secondContactId = "";

  results.push(
    await pass("Create scoped factoring vendor for company-local join tests", async () => {
      await runAsUser(client, refs.managerId, async () => {
        const res = await client.query(
          `
          INSERT INTO mdata.vendors (
            vendor_name, vendor_type, operating_company_id, notes, created_by_user_id, updated_by_user_id
          ) VALUES (
            $1, 'Other', $2, 'Scoped factoring test vendor', $3, $3
          )
          RETURNING id
        `,
          [`Scoped Factor ${suffix}`, refs.companyAId, refs.managerId]
        );
        scopedFactorVendorId = String(res.rows[0]?.id ?? "");
        if (scopedFactorVendorId) createdVendorIds.push(scopedFactorVendorId);
      });
      if (!scopedFactorVendorId) throw new Error("failed to create scoped factoring vendor");
    })
  );

  results.push(
    await pass("Insert customer with full profile fields", async () => {
      await runAsUser(client, refs.managerId, async () => {
        const res = await client.query(
          `
          INSERT INTO mdata.customers (
            customer_name, customer_code, billing_email, billing_phone, billing_address_line1,
            mc_number, dot_number, credit_limit, operating_company_id, status,
            notes, website, office_phone, fax_phone, main_contact_name, main_contact_title, main_contact_email, main_contact_phone, main_contact_mobile,
            ar_email, ar_phone, ap_email, ap_phone,
            free_time_pickup_minutes, free_time_delivery_minutes, detention_rate_per_hour,
            factoring_eligible, factoring_company_vendor_id, factoring_recourse_type,
            created_by_user_id, updated_by_user_id
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$29
          )
          RETURNING id
        `,
          [
            `Customer Full ${suffix}`,
            `CF-${suffix.toUpperCase()}`,
            `billing-${suffix}@example.com`,
            "5551110000",
            "123 Main St",
            `MC-${suffix}`,
            `DOT-${suffix}`,
            25000,
            refs.companyAId,
            "Notes fixture",
            "https://example.com",
            "555-222-3333",
            "555-222-4444",
            "Main Contact",
            "Controller",
            `main-${suffix}@example.com`,
            "555-222-5555",
            "555-222-6666",
            `ar-${suffix}@example.com`,
            "555-333-1111",
            `ap-${suffix}@example.com`,
            "555-333-2222",
            120,
            120,
            75,
            true,
            scopedFactorVendorId,
            "recourse",
            refs.managerId,
          ]
        );
        customerId = String(res.rows[0].id);
        createdCustomerIds.push(customerId);
      });
    })
  );

  results.push(
    await pass("Insert rejects factoring_advance_rate_override > 100", async () => {
      await runAsUser(client, refs.managerId, async () => {
        let failedAsExpected = false;
        try {
          await client.query(
            `
            INSERT INTO mdata.customers (
              customer_name, customer_type, operating_company_id, factoring_advance_rate_override, created_by_user_id, updated_by_user_id
            ) VALUES ($1, 'broker', $2, 101, $3, $3)
          `,
            [`Invalid Factor Advance ${suffix}`, refs.companyAId, refs.managerId]
          );
        } catch (error) {
          if (String(error?.code) === "23514") failedAsExpected = true;
        }
        if (!failedAsExpected) throw new Error("expected check constraint violation for factoring_advance_rate_override");
      });
    })
  );

  results.push(
    await pass("Insert rejects invalid factoring_recourse_type", async () => {
      await runAsUser(client, refs.managerId, async () => {
        let failedAsExpected = false;
        try {
          await client.query(
            `
            INSERT INTO mdata.customers (
              customer_name, customer_type, operating_company_id, factoring_recourse_type, created_by_user_id, updated_by_user_id
            ) VALUES ($1, 'broker', $2, 'invalid', $3, $3)
          `,
            [`Invalid Factor Recourse ${suffix}`, refs.companyAId, refs.managerId]
          );
        } catch (error) {
          if (String(error?.code) === "23514") failedAsExpected = true;
        }
        if (!failedAsExpected) throw new Error("expected check constraint violation for factoring_recourse_type");
      });
    })
  );

  await startServer(process.cwd());

  results.push(
    await pass("Primary switching clears old primary contact", async () => {
      const createOne = await fetch(`${apiBase}/api/v1/mdata/customers/${customerId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `ih35_session=${refs.managerSessionId}` },
        body: JSON.stringify({ name: "First Contact", department: "billing", is_primary: true }),
      });
      if (createOne.status !== 201) throw new Error(`create one failed ${createOne.status}`);

      const createTwo = await fetch(`${apiBase}/api/v1/mdata/customers/${customerId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `ih35_session=${refs.managerSessionId}` },
        body: JSON.stringify({ name: "Second Contact", department: "dispatch", is_primary: true }),
      });
      if (createTwo.status !== 201) throw new Error(`create two failed ${createTwo.status}`);
      secondContactId = String((await createTwo.json())?.contact?.id ?? "");
      createdContactIds.push(secondContactId);

      const detailRes = await fetch(`${apiBase}/api/v1/mdata/customers/${customerId}/detail`, {
        headers: { Cookie: `ih35_session=${refs.managerSessionId}` },
      });
      if (!detailRes.ok) throw new Error(`detail failed ${detailRes.status}`);
      const payload = await detailRes.json();
      const primaryCount = (payload.customer.contacts ?? []).filter((c) => c.is_primary).length;
      if (primaryCount !== 1) throw new Error(`expected one primary, got ${primaryCount}`);
      if (payload.customer.factoring_company_name !== `Scoped Factor ${suffix}`) {
        throw new Error(`expected factoring_company_name Scoped Factor ${suffix}, got ${payload.customer.factoring_company_name ?? "null"}`);
      }
    })
  );

  results.push(
    await pass("PATCH customer factoring recourse_type to non_recourse succeeds", async () => {
      const patchRes = await fetch(`${apiBase}/api/v1/mdata/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: `ih35_session=${refs.managerSessionId}` },
        body: JSON.stringify({ factoring_recourse_type: "non_recourse" }),
      });
      if (!patchRes.ok) throw new Error(`factoring patch failed ${patchRes.status}`);
      const payload = await patchRes.json();
      if (payload.factoring_recourse_type !== "non_recourse") {
        throw new Error("factoring_recourse_type did not update to non_recourse");
      }
    })
  );

  results.push(
    await pass("Status change to blacklist emits warning audit event", async () => {
      const patchRes = await fetch(`${apiBase}/api/v1/mdata/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: `ih35_session=${refs.managerSessionId}` },
        body: JSON.stringify({ status: "blacklist", status_change_reason: "Non-payment risk" }),
      });
      if (!patchRes.ok) throw new Error(`status patch failed ${patchRes.status}`);

      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `SELECT count(*)::int AS cnt FROM audit.audit_events WHERE source = $1 AND event_class = 'mdata.customers.status_changed' AND severity = 'warning' AND payload ->> 'customer_id' = $2`,
          [verifySource, customerId]
        );
        if (Number(auditRes.rows[0]?.cnt ?? 0) < 1) throw new Error("missing status_changed warning audit");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
    })
  );

  results.push(
    await pass("Contact deactivate/reactivate emit audit events", async () => {
      const deactivateRes = await fetch(`${apiBase}/api/v1/mdata/customers/${customerId}/contacts/${secondContactId}`, {
        method: "DELETE",
        headers: { Cookie: `ih35_session=${refs.managerSessionId}` },
      });
      if (!deactivateRes.ok) throw new Error(`deactivate failed ${deactivateRes.status}`);

      const reactivateRes = await fetch(`${apiBase}/api/v1/mdata/customers/${customerId}/contacts/${secondContactId}/reactivate`, {
        method: "POST",
        headers: { Cookie: `ih35_session=${refs.managerSessionId}` },
      });
      if (!reactivateRes.ok) throw new Error(`reactivate failed ${reactivateRes.status}`);

      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `SELECT event_class, count(*)::int AS cnt FROM audit.audit_events WHERE source = $1 AND payload ->> 'resource_id' = $2 AND event_class = ANY($3::text[]) GROUP BY event_class`,
          [verifySource, secondContactId, ["mdata.customer_contacts.deactivated", "mdata.customer_contacts.reactivated", "mdata.customer_contacts.set_primary"]]
        );
        const byClass = new Map(auditRes.rows.map((row) => [row.event_class, Number(row.cnt)]));
        if ((byClass.get("mdata.customer_contacts.deactivated") ?? 0) < 1) throw new Error("missing deactivated audit");
        if ((byClass.get("mdata.customer_contacts.reactivated") ?? 0) < 1) throw new Error("missing reactivated audit");
        if ((byClass.get("mdata.customer_contacts.set_primary") ?? 0) < 1) throw new Error("missing set_primary audit");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
    })
  );

  results.push(
    await pass("RLS: contact only visible to user with matching company access", async () => {
      await runAsUser(client, refs.managerId, async () => {
        const visibleRes = await client.query(`SELECT count(*)::int AS cnt FROM mdata.customer_contacts WHERE customer_uuid = $1 AND deactivated_at IS NULL`, [customerId]);
        if (Number(visibleRes.rows[0]?.cnt ?? 0) < 1) throw new Error("manager should see contacts");
      });
      await runAsUser(client, refs.outsiderId, async () => {
        const hiddenRes = await client.query(`SELECT count(*)::int AS cnt FROM mdata.customer_contacts WHERE customer_uuid = $1 AND deactivated_at IS NULL`, [customerId]);
        if (Number(hiddenRes.rows[0]?.cnt ?? 0) !== 0) throw new Error("outsider should not see foreign-company contacts");
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
      if (createdContactIds.length > 0) await client.query(`DELETE FROM mdata.customer_contacts WHERE uuid = ANY($1::uuid[])`, [createdContactIds]);
      if (createdCustomerIds.length > 0) await client.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [createdCustomerIds]);
      if (createdVendorIds.length > 0) await client.query(`DELETE FROM mdata.vendors WHERE id = ANY($1::uuid[])`, [createdVendorIds]);
      if (createdSessionIds.length > 0) await client.query(`DELETE FROM identity.sessions WHERE id = ANY($1::text[])`, [createdSessionIds]);
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM org.user_company_access WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      if (createdCompanyIds.length > 0) await client.query(`DELETE FROM org.companies WHERE id = ANY($1::uuid[])`, [createdCompanyIds]);
      await client.query("COMMIT");
      console.log("PASS: cleanup customer full profile fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup customer full profile fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: customer full profile verification complete.");
  process.exit(0);
}

console.error("FAIL: customer full profile verification failed.");
process.exit(1);
