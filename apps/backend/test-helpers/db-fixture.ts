import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildPgClientConfig } from "../src/lib/pg-connection-options.js";
import { TEST_OWNER_EMAIL, TEST_OWNER_GOOGLE_ID, TEST_OWNER_USER_ID } from "./constants.js";

// Canonical home: ./isolated-company.ts — re-export for import convenience (#2717 / #2719).
export {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
  type CreateIsolatedOperatingCompanyOpts,
} from "./isolated-company.js";
export {
  acquireGlobalAccountRoleBindingsLock,
  releaseGlobalAccountRoleBindingsLock,
  saveGlobalAccountRoleBindings,
  restoreGlobalAccountRoleBindings,
  saveGlobalCoaRoleDesignations,
  restoreGlobalCoaRoleDesignations,
  GLOBAL_ACCOUNT_ROLE_BINDINGS_TEST_LOCK_KEY,
  type SavedAccountRoleBinding,
  type SavedCoaRoleDesignation,
} from "./global-account-role-bindings-lock.js";

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
// P44 (202612502000): a BEFORE INSERT trigger on mdata.loads resolves dispatch_flag_color_id from
// catalogs.dispatch_flag_colors by (operating_company_id, flag_code) and RAISES when the company has no
// canonical rows. Prod companies were backfilled by the migration; fixture-created companies get nothing,
// so every load INSERT in the integration suite failed with "No canonical dispatch flag color". Seed the
// six codes the trigger can request, idempotently (mirrors the migration backfill / USMCA bootstrap shape).
export async function seedDispatchFlagColorsForCompany(client: pg.Client, companyId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO catalogs.dispatch_flag_colors
        (operating_company_id, flag_code, display_name, hex_color, severity_order, sort_order, created_by_user_id)
      VALUES
        ($1::uuid, 'RED',    'Problem',        '#dc2626', 90, 10, $2::uuid),
        ($1::uuid, 'YELLOW', 'Assigned',       '#ca8a04', 50, 20, $2::uuid),
        ($1::uuid, 'BLUE',   'In Transit',     '#2563eb', 40, 30, $2::uuid),
        ($1::uuid, 'GREEN',  'Delivered',      '#16a34a', 30, 40, $2::uuid),
        ($1::uuid, 'BLACK',  'Closed',         '#111827', 20, 50, $2::uuid),
        ($1::uuid, 'GRAY',   'Draft',          '#6b7280', 10, 60, $2::uuid)
      ON CONFLICT (operating_company_id, flag_code) DO NOTHING
    `,
    [companyId, TEST_OWNER_USER_ID]
  );
}

// NOT-NULL-no-default columns include load_trailer_equipment_id (P44 migration).
async function resolveLoadTrailerEquipmentId(client: pg.Client, companyId: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id
      FROM catalogs.load_trailer_equipment
      WHERE operating_company_id = $1::uuid
        AND code = 'DRY_VAN'
      LIMIT 1
    `,
    [companyId]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO catalogs.load_trailer_equipment (operating_company_id, code, display_name, is_active, sort_order)
      VALUES ($1::uuid, 'DRY_VAN', 'Dry Van', true, 30)
      ON CONFLICT (operating_company_id, code) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `,
    [companyId]
  );
  return inserted.rows[0]!.id;
}

export async function resolveLoadTrailerEquipmentIdForTests(
  client: pg.Client,
  companyId: string
): Promise<string> {
  // Company-GUC-only catalog policy (see seedLoadForCompany note): tests call this helper on their OWN
  // clients, so the GUC must be set here as well or the DRY_VAN upsert 42501s on a fresh DB.
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
  return resolveLoadTrailerEquipmentId(client, companyId);
}

/** P44 prerequisites for any direct INSERT INTO mdata.loads in tests (flag colors + trailer catalog). */
export async function prepareCompanyForLoadInserts(client: pg.Client, companyId: string): Promise<string> {
  await seedDispatchFlagColorsForCompany(client, companyId);
  return resolveLoadTrailerEquipmentId(client, companyId);
}

async function seedLoadForCompany(client: pg.Client, companyId: string, suffix: string): Promise<string> {
  // Generic catalog tables (202606241800 loop) carry a company-GUC-ONLY policy — no lucia-bypass clause:
  //   USING/WITH CHECK operating_company_id::text = current_setting('app.operating_company_id', true)
  // The fixture historically set only app.bypass_rls, so catalog seeds (dispatch_flag_colors,
  // load_trailer_equipment) hit 42501 on the fresh CI DB. Transaction-local; safe alongside bypass.
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
  await seedDispatchFlagColorsForCompany(client, companyId);
  const cust = await client.query<{ id: string }>(
    `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
    [`E2E Customer ${suffix}`, companyId]
  );
  const customerId = cust.rows[0]!.id;
  const trailerEquipmentId = await resolveLoadTrailerEquipmentId(client, companyId);
  const load = await client.query<{ id: string }>(
    `
      INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
      VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid)
      RETURNING id
    `,
    [companyId, `E2E-${suffix}`, customerId, TEST_OWNER_USER_ID, trailerEquipmentId]
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
    // Grant the integration Owner user membership of the SECOND entity too — routes assert
    // assertCompanyMembership (no Owner bypass; it checks org.user_company_access), so a test that hits
    // a route scoped to this entity 403s without it. (ensureIntegrationPrerequisites grants the first
    // entity the same way.) Idempotent; makes the second-entity tests self-contained, not order-dependent.
    await client.query(
      `INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT (user_id, company_id) DO NOTHING`,
      [TEST_OWNER_USER_ID, companyId]
    );
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]); // catalog policies are company-GUC-only
    await seedDispatchFlagColorsForCompany(client, companyId); // P44 trigger prerequisite (see helper)
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

    // default_company_id MUST be seeded to TRANSP. For an Owner, org.user_accessible_company_ids()
    // returns EVERY company, so resolveOperatingCompanyId(no explicit id) falls back to the LOWEST
    // company UUID (USMCA/TRK < TRANSP) when default_company_id is NULL. By-id mutation routes (e.g.
    // PATCH /mdata/customers/:id) intentionally scope to the caller's current/default company and do
    // NOT accept an operating_company_id override, so an unset default made them resolve the wrong
    // entity → the seeded TRANSP customer was "not found" → 404 instead of the real 400 validation.
    // Production Owners always have default_company_id set (migration 0014); the fixture must mirror that.
    await client.query(
      `
        INSERT INTO identity.users (id, email, google_user_id, role, preferred_language, default_company_id)
        VALUES ($1::uuid, $2, $3, 'Owner', 'en', $4::uuid)
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              role = EXCLUDED.role,
              google_user_id = EXCLUDED.google_user_id,
              preferred_language = EXCLUDED.preferred_language,
              default_company_id = EXCLUDED.default_company_id
      `,
      [TEST_OWNER_USER_ID, TEST_OWNER_EMAIL, TEST_OWNER_GOOGLE_ID, companyId]
    );

    await client.query(
      `
        INSERT INTO org.user_company_access (user_id, company_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT (user_id, company_id) DO NOTHING
      `,
      [TEST_OWNER_USER_ID, companyId]
    );

    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]); // catalog policies are company-GUC-only
    await seedDispatchFlagColorsForCompany(client, companyId); // P44 trigger prerequisite (see helper)
    await resolveLoadTrailerEquipmentId(client, companyId);
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
