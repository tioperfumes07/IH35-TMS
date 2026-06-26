import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildPgClientConfig } from "../src/lib/pg-connection-options.js";
import { TEST_OWNER_EMAIL, TEST_OWNER_GOOGLE_ID, TEST_OWNER_USER_ID } from "./constants.js";

let cachedOperatingCompanyId: string | null = null;
let cachedWorkOrderUnitId: string | null = null;
let cachedWorkOrderDriverId: string | null = null;
let cachedIntegrationLoadId: string | null = null;
let cachedSecondEntity: { companyId: string; loadId: string } | null = null;

function connectString(): string {
  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for integration tests");
  return cs;
}

// Seed a minimal VALID mdata.loads row for a given operating company under app.bypass_rls. Satisfies the real
// NOT-NULL-no-default columns (operating_company_id, load_number, customer_id, dispatcher_user_id); status defaults
// 'draft'. Seeds a customer for the company first. Returns the new load id. [VERIFY]'d against the live schema.
async function seedLoadForCompany(client: pg.Client, companyId: string, suffix: string): Promise<string> {
  const cust = await client.query<{ id: string }>(
    `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
    [`E2E Customer ${suffix}`, companyId]
  );
  const customerId = cust.rows[0]!.id;
  const load = await client.query<{ id: string }>(
    `
      INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id)
      VALUES ($1::uuid, $2, $3::uuid, $4::uuid)
      RETURNING id
    `,
    [companyId, `E2E-${suffix}`, customerId, TEST_OWNER_USER_ID]
  );
  return load.rows[0]!.id;
}

/** Seed (once, cached) a minimal load under the prerequisite TRANSP company; returns its id. */
export async function ensureIntegrationLoadId(): Promise<string> {
  if (cachedIntegrationLoadId) return cachedIntegrationLoadId;
  const companyId = await ensureIntegrationPrerequisites();
  const client = new pg.Client(buildPgClientConfig(connectString()));
  await client.connect();
  try {
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const loadId = await seedLoadForCompany(client, companyId, randomUUID().slice(0, 8));
    await client.query("COMMIT");
    cachedIntegrationLoadId = loadId;
    return loadId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/**
 * Seed (once, cached) a SECOND, independent operating company (USMCA — a different operating_company_id than
 * the TRANSP prerequisite) + a load under it. This is the FOREIGN entity used to prove cross-entity RLS hiding:
 * a cash-advance row written under TRANSP must be INVISIBLE when the session switches to this company's RLS context.
 */
export async function ensureSecondEntityLoad(): Promise<{ companyId: string; loadId: string }> {
  if (cachedSecondEntity) return cachedSecondEntity;
  await ensureIntegrationPrerequisites();
  const client = new pg.Client(buildPgClientConfig(connectString()));
  await client.connect();
  try {
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const compRes = await client.query<{ id: string }>(`SELECT id FROM org.companies WHERE code = 'USMCA' LIMIT 1`);
    const companyId = compRes.rows[0]?.id;
    if (!companyId) throw new Error("integration tests require org.companies seed row code=USMCA (second entity)");
    const loadId = await seedLoadForCompany(client, companyId, `2E-${randomUUID().slice(0, 8)}`);
    await client.query("COMMIT");
    cachedSecondEntity = { companyId, loadId };
    return cachedSecondEntity;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/**
 * Run a callback with a given operating company's RLS context set on the client — bypass OFF — so RLS is
 * ENFORCED (matches the real route mechanism: current_setting('app.operating_company_id')). Resets in finally.
 * Use INSIDE a transaction (the set_config is transaction-local via the `true` is_local flag).
 */
export async function withCompanyRls<T>(client: pg.Client, companyId: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`SELECT set_config('app.bypass_rls', '', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
  try {
    return await fn();
  } finally {
    await client.query(`SELECT set_config('app.operating_company_id', '', true)`).catch(() => {});
  }
}

export async function ensureIntegrationPrerequisites(): Promise<string> {
  if (cachedOperatingCompanyId) return cachedOperatingCompanyId;

  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for integration tests");
  }

  const client = new pg.Client(buildPgClientConfig(cs));
  await client.connect();

  try {
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    // Vitest runs files in parallel forks; serialize fixture seeding to avoid
    // concurrent upserts tripping unique constraints (e.g. google_user_id).
    await client.query("SELECT pg_advisory_xact_lock(922337203685477000::bigint)");

    const companyRes = await client.query(`SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1`);
    const companyId = companyRes.rows[0]?.id as string | undefined;
    if (!companyId) {
      throw new Error("integration tests require org.companies seed row code=TRANSP");
    }

    // Self-heal: 0057 drops inline UNIQUE on email (users_email_key) in favor of idx_users_email_unique on lower(email).
    // ON CONFLICT (email) requires a unique constraint/index on (email) alone — fresh DBs only have the expression index, so upsert by PK.
    // Seed data may already occupy integration.google_user_id under a different PK — clear so INSERT … ON CONFLICT (id) cannot violate users_google_user_id_key.
    await client.query(`UPDATE identity.users SET google_user_id = NULL WHERE google_user_id = $1 AND id <> $2::uuid`, [
      TEST_OWNER_GOOGLE_ID,
      TEST_OWNER_USER_ID,
    ]);

    await client.query(
      `
        INSERT INTO identity.users (id, email, google_user_id, role, preferred_language)
        VALUES ($1::uuid, $2, $3, 'Owner', 'en')
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              role = EXCLUDED.role,
              google_user_id = EXCLUDED.google_user_id,
              preferred_language = EXCLUDED.preferred_language
      `,
      [TEST_OWNER_USER_ID, TEST_OWNER_EMAIL, TEST_OWNER_GOOGLE_ID]
    );

    await client.query(
      `
        INSERT INTO org.user_company_access (user_id, company_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT (user_id, company_id) DO NOTHING
      `,
      [TEST_OWNER_USER_ID, companyId]
    );

    await client.query("COMMIT");
    cachedOperatingCompanyId = companyId;
    return companyId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

export function getOperatingCompanyId(): string {
  if (!cachedOperatingCompanyId) {
    throw new Error("ensureIntegrationPrerequisites() must run before getOperatingCompanyId()");
  }
  return cachedOperatingCompanyId;
}

/**
 * Resolves tenant-scoped unit + driver rows seeded by migrations (TRANSP).
 * Used by work-order integration tests so payloads satisfy validateCreateWorkOrder.
 */
export async function getIntegrationWorkOrderSeedIds(): Promise<{ unitId: string; driverId: string }> {
  if (cachedWorkOrderUnitId && cachedWorkOrderDriverId) {
    return { unitId: cachedWorkOrderUnitId, driverId: cachedWorkOrderDriverId };
  }

  const companyId = cachedOperatingCompanyId ?? (await ensureIntegrationPrerequisites());

  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for getIntegrationWorkOrderSeedIds()");
  }

  const client = new pg.Client(buildPgClientConfig(cs));
  await client.connect();

  try {
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const unitRes = await client.query<{ id: string }>(
      `SELECT id FROM mdata.units WHERE currently_leased_to_company_id = $1::uuid LIMIT 1`,
      [companyId]
    );
    const unitFallback = await client.query<{ id: string }>(
      `SELECT id FROM mdata.units ORDER BY created_at ASC LIMIT 1`
    );
    let unitId = unitRes.rows[0]?.id ?? unitFallback.rows[0]?.id;

    const driverRes = await client.query<{ id: string }>(
      `SELECT id FROM mdata.drivers WHERE operating_company_id = $1::uuid LIMIT 1`,
      [companyId]
    );
    const driverFallback = await client.query<{ id: string }>(
      `SELECT id FROM mdata.drivers WHERE deactivated_at IS NULL ORDER BY created_at ASC LIMIT 1`
    );
    let driverId = driverRes.rows[0]?.id ?? driverFallback.rows[0]?.id;

    // Migration-only CI DBs often have zero fleet rows — provision minimal anchors (matches settlement pdf e2e patterns).
    const suf = randomUUID().slice(0, 8);
    if (!driverId) {
      const ins = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.drivers (first_name, last_name, phone, email, operating_company_id)
          VALUES ($1, $2, $3, $4, $5::uuid)
          RETURNING id
        `,
        ["Integration", `WO-${suf}`, `+15550001${suf.slice(0, 4)}`, `wo-fixture-${suf}@test.invalid`, companyId]
      );
      driverId = ins.rows[0]?.id;
    }
    if (!unitId) {
      const vin = (`VIN${suf}`.padEnd(17, "0")).slice(0, 17);
      const ins = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.units (unit_number, vin, owner_company_id, currently_leased_to_company_id)
          VALUES (
            $1,
            $2,
            (SELECT id FROM org.companies WHERE code = 'TRK' LIMIT 1),
            $3::uuid
          )
          RETURNING id
        `,
        [`WO-I-${suf}`, vin, companyId]
      );
      unitId = ins.rows[0]?.id;
    }

    if (!unitId || !driverId) {
      throw new Error("failed to provision integration work-order anchor rows (unit/driver)");
    }

    await client.query("COMMIT");
    cachedWorkOrderUnitId = unitId;
    cachedWorkOrderDriverId = driverId;
    return { unitId, driverId };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}
