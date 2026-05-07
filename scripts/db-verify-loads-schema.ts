import crypto from "node:crypto";
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
const createdUserIds: string[] = [];
const createdDriverIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdLoadIds: string[] = [];
const createdStopIds: string[] = [];
const createdAccessPairs: Array<{ userId: string; companyId: string }> = [];

async function runWithBypass<T>(client: pg.PoolClient, fn: () => Promise<T>) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runAsUser<T>(client: pg.PoolClient, userId: string, fn: () => Promise<T>) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
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

const client = await pool.connect();
const results: boolean[] = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const companiesRes = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'TRK')`
    );
    const companiesByCode = new Map(companiesRes.rows.map((row) => [row.code, row.id]));
    const transpCompanyId = companiesByCode.get("TRANSP");
    const trkCompanyId = companiesByCode.get("TRK");
    if (!transpCompanyId || !trkCompanyId) throw new Error("Expected TRANSP and TRK companies");

    const ownerRes = await client.query<{ id: string }>(
      `SELECT id FROM identity.users WHERE email = 'tioperfumes07@gmail.com' LIMIT 1`
    );
    if (ownerRes.rows.length === 0) throw new Error("Owner user not found");

    return {
      ownerUserId: ownerRes.rows[0].id,
      transpCompanyId,
      trkCompanyId,
    };
  });

  results.push(
    await pass("Loads table has required columns and indexes", async () => {
      await runWithBypass(client, async () => {
        const colsRes = await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='mdata' AND table_name='loads'`
        );
        const cols = new Set(colsRes.rows.map((row) => row.column_name));
        for (const required of [
          "id",
          "operating_company_id",
          "load_number",
          "customer_id",
          "status",
          "rate_total_cents",
          "currency_code",
          "assigned_unit_id",
          "assigned_primary_driver_id",
          "assigned_secondary_driver_id",
          "dispatcher_user_id",
          "notes",
          "created_at",
          "updated_at",
          "soft_deleted_at",
          "deleted_by_user_id",
        ]) {
          if (!cols.has(required)) throw new Error(`missing loads column: ${required}`);
        }

        const idxRes = await client.query<{ indexname: string }>(
          `SELECT indexname FROM pg_indexes WHERE schemaname='mdata' AND tablename='loads'`
        );
        const idx = new Set(idxRes.rows.map((row) => row.indexname));
        for (const required of ["idx_loads_company_status", "idx_loads_customer", "idx_loads_unit", "idx_loads_driver_primary"]) {
          if (!idx.has(required)) throw new Error(`missing loads index: ${required}`);
        }
      });
    })
  );

  results.push(
    await pass("load_stops table and ON DELETE CASCADE FK exist", async () => {
      await runWithBypass(client, async () => {
        const colsRes = await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='mdata' AND table_name='load_stops'`
        );
        const cols = new Set(colsRes.rows.map((row) => row.column_name));
        for (const required of [
          "id",
          "load_id",
          "sequence_number",
          "stop_type",
          "location_id",
          "status",
          "created_at",
          "updated_at",
        ]) {
          if (!cols.has(required)) throw new Error(`missing load_stops column: ${required}`);
        }

        const fkRes = await client.query<{ confdeltype: string }>(
          `
            SELECT c.confdeltype
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'mdata'
              AND t.relname = 'load_stops'
              AND c.contype = 'f'
              AND c.conname LIKE '%load_id%'
            LIMIT 1
          `
        );
        if (fkRes.rows.length === 0) throw new Error("load_stops load_id FK not found");
        if (fkRes.rows[0].confdeltype !== "c") throw new Error("load_stops load_id FK is not ON DELETE CASCADE");
      });
    })
  );

  results.push(
    await pass("Load/stop enums are present", async () => {
      await runWithBypass(client, async () => {
        const enumRes = await client.query<{ typname: string; enumlabel: string }>(
          `
            SELECT t.typname, e.enumlabel
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE n.nspname = 'mdata'
              AND t.typname IN ('load_status_enum', 'stop_type_enum', 'stop_status_enum')
            ORDER BY t.typname, e.enumsortorder
          `
        );
        const grouped = new Map<string, string[]>();
        for (const row of enumRes.rows) {
          const list = grouped.get(row.typname) ?? [];
          list.push(row.enumlabel);
          grouped.set(row.typname, list);
        }
        const expected: Record<string, string[]> = {
          load_status_enum: [
            "draft",
            "booked",
            "planned",
            "assigned",
            "dispatched",
            "at_pickup",
            "in_transit",
            "at_delivery",
            "delivered",
            "invoiced",
            "paid",
            "closed",
            "cancelled",
          ],
          stop_type_enum: ["pickup", "delivery", "fuel", "rest", "border"],
          stop_status_enum: ["pending", "arrived", "departed", "cancelled"],
        };
        for (const [enumName, values] of Object.entries(expected)) {
          const got = grouped.get(enumName) ?? [];
          if (got.join("|") !== values.join("|")) throw new Error(`enum mismatch for ${enumName}`);
        }
      });
    })
  );

  results.push(
    await pass("RLS policies exist for loads and load_stops", async () => {
      await runWithBypass(client, async () => {
        const policyRes = await client.query<{ tablename: string; policyname: string }>(
          `
            SELECT tablename, policyname
            FROM pg_policies
            WHERE schemaname = 'mdata'
              AND tablename IN ('loads', 'load_stops')
          `
        );
        const keySet = new Set(policyRes.rows.map((row) => `${row.tablename}:${row.policyname}`));
        for (const expected of [
          "loads:loads_select_office",
          "loads:loads_select_driver",
          "loads:loads_insert_office",
          "loads:loads_update_office",
          "load_stops:load_stops_select",
          "load_stops:load_stops_insert",
          "load_stops:load_stops_update",
        ]) {
          if (!keySet.has(expected)) throw new Error(`missing policy ${expected}`);
        }
      });
    })
  );

  const fixtures = await runWithBypass(client, async () => {
    const managerTranspRes = await client.query<{ id: string }>(
      `
        INSERT INTO identity.users (email, google_user_id, role, default_company_id)
        VALUES ($1, $2, 'Manager', $3)
        RETURNING id
      `,
      [`loads-manager-transp-${suffix}@example.com`, `loads-manager-transp-${suffix}`, refs.transpCompanyId]
    );
    const managerTrkRes = await client.query<{ id: string }>(
      `
        INSERT INTO identity.users (email, google_user_id, role, default_company_id)
        VALUES ($1, $2, 'Manager', $3)
        RETURNING id
      `,
      [`loads-manager-trk-${suffix}@example.com`, `loads-manager-trk-${suffix}`, refs.trkCompanyId]
    );
    const driverIdentityRes = await client.query<{ id: string }>(
      `
        INSERT INTO identity.users (email, google_user_id, role, default_company_id)
        VALUES ($1, $2, 'Driver', $3)
        RETURNING id
      `,
      [`loads-driver-${suffix}@example.com`, `loads-driver-${suffix}`, refs.transpCompanyId]
    );

    const managerTranspId = managerTranspRes.rows[0].id;
    const managerTrkId = managerTrkRes.rows[0].id;
    const driverIdentityId = driverIdentityRes.rows[0].id;
    createdUserIds.push(managerTranspId, managerTrkId, driverIdentityId);

    for (const pair of [
      { userId: managerTranspId, companyId: refs.transpCompanyId },
      { userId: managerTrkId, companyId: refs.trkCompanyId },
      { userId: driverIdentityId, companyId: refs.transpCompanyId },
    ]) {
      await client.query(
        `
          INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, company_id) DO NOTHING
        `,
        [pair.userId, pair.companyId, refs.ownerUserId]
      );
      createdAccessPairs.push(pair);
    }

    const driverRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.drivers (
          identity_user_id, first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
        ) VALUES (
          $1, $2, $3, $4, 'Active', $5, $5
        )
        RETURNING id
      `,
      [driverIdentityId, "Load", "Driver", `+1956555${suffix.slice(0, 4)}`, refs.ownerUserId]
    );
    const driverId = driverRes.rows[0].id;
    createdDriverIds.push(driverId);

    const customerTranspRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.customers (customer_name, customer_code, operating_company_id, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $4)
        RETURNING id
      `,
      [`Load Verify TRANSP ${suffix}`, `LDT-${suffix}`, refs.transpCompanyId, refs.ownerUserId]
    );
    const customerTrkRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.customers (customer_name, customer_code, operating_company_id, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $4)
        RETURNING id
      `,
      [`Load Verify TRK ${suffix}`, `LDK-${suffix}`, refs.trkCompanyId, refs.ownerUserId]
    );
    const customerTranspId = customerTranspRes.rows[0].id;
    const customerTrkId = customerTrkRes.rows[0].id;
    createdCustomerIds.push(customerTranspId, customerTrkId);

    let transpAssignedLoadId = "";
    let transpUnassignedLoadId = "";
    let trkLoadId = "";
    let stopId = "";

    await runAsUser(client, managerTranspId, async () => {
      const assigned = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.loads (
            operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
            assigned_primary_driver_id, dispatcher_user_id, notes
          )
          VALUES ($1, $2, $3, 'assigned', 125000, 'USD', $4, $5, $6)
          RETURNING id
        `,
        [refs.transpCompanyId, `LTRANSP-${suffix}-0001`, customerTranspId, driverId, managerTranspId, "fixture assigned load"]
      );
      transpAssignedLoadId = assigned.rows[0].id;

      const unassigned = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.loads (
            operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
            dispatcher_user_id, notes
          )
          VALUES ($1, $2, $3, 'booked', 98000, 'USD', $4, $5)
          RETURNING id
        `,
        [refs.transpCompanyId, `LTRANSP-${suffix}-0002`, customerTranspId, managerTranspId, "fixture unassigned load"]
      );
      transpUnassignedLoadId = unassigned.rows[0].id;

      const stopRes = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, city, state, country, status)
          VALUES ($1, 1, 'pickup', 'Laredo', 'TX', 'US', 'pending')
          RETURNING id
        `,
        [transpAssignedLoadId]
      );
      stopId = stopRes.rows[0].id;
    });

    await runAsUser(client, managerTrkId, async () => {
      const trkLoad = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.loads (
            operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
            dispatcher_user_id, notes
          )
          VALUES ($1, $2, $3, 'booked', 110000, 'USD', $4, $5)
          RETURNING id
        `,
        [refs.trkCompanyId, `LTRK-${suffix}-0001`, customerTrkId, managerTrkId, "fixture trk load"]
      );
      trkLoadId = trkLoad.rows[0].id;
    });

    createdLoadIds.push(transpAssignedLoadId, transpUnassignedLoadId, trkLoadId);
    createdStopIds.push(stopId);

    return {
      managerTranspId,
      managerTrkId,
      driverIdentityId,
      transpAssignedLoadId,
      transpUnassignedLoadId,
      trkLoadId,
    };
  });

  results.push(
    await pass("Driver SELECT policy only returns assigned loads", async () => {
      await runAsUser(client, fixtures.driverIdentityId, async () => {
        const res = await client.query<{ id: string }>(
          `
            SELECT id
            FROM mdata.loads
            WHERE soft_deleted_at IS NULL
            ORDER BY id
          `
        );
        const ids = res.rows.map((row) => row.id);
        if (ids.length !== 1 || ids[0] !== fixtures.transpAssignedLoadId) {
          throw new Error(`driver visible load ids mismatch: ${ids.join(",")}`);
        }
      });
    })
  );

  results.push(
    await pass("Office SELECT policy sees all company loads", async () => {
      await runAsUser(client, fixtures.managerTranspId, async () => {
        const res = await client.query<{ cnt: number }>(
          `
            SELECT count(*)::int AS cnt
            FROM mdata.loads
            WHERE operating_company_id = $1
          `,
          [refs.transpCompanyId]
        );
        if (Number(res.rows[0]?.cnt ?? 0) < 2) throw new Error("manager TRANSP should see at least 2 loads");
      });
    })
  );

  results.push(
    await pass("Cross-company isolation blocks TRANSP manager from TRK load", async () => {
      await runAsUser(client, fixtures.managerTranspId, async () => {
        const res = await client.query<{ id: string }>(`SELECT id FROM mdata.loads WHERE id = $1`, [fixtures.trkLoadId]);
        if (res.rows.length !== 0) throw new Error("TRANSP manager should not see TRK load");
      });
    })
  );

  results.push(
    await pass("load_stops FK is configured as ON DELETE CASCADE", async () => {
      await runWithBypass(client, async () => {
        const fkRes = await client.query<{ confdeltype: string }>(
          `
            SELECT c.confdeltype
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'mdata'
              AND t.relname = 'load_stops'
              AND c.contype = 'f'
              AND c.conname LIKE '%load_id%'
            LIMIT 1
          `
        );
        if (fkRes.rows.length === 0) throw new Error("load_stops load_id FK not found");
        if (fkRes.rows[0].confdeltype !== "c") throw new Error("load_stops load_id FK is not ON DELETE CASCADE");
      });
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String((error as Error)?.message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdStopIds.length > 0) await client.query(`DELETE FROM mdata.load_stops WHERE id = ANY($1::uuid[])`, [createdStopIds]);
      if (createdLoadIds.length > 0) await client.query(`DELETE FROM mdata.loads WHERE id = ANY($1::uuid[])`, [createdLoadIds]);
      if (createdDriverIds.length > 0) await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      if (createdCustomerIds.length > 0) await client.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [createdCustomerIds]);
      if (createdAccessPairs.length > 0) {
        for (const pair of createdAccessPairs) {
          await client.query(`DELETE FROM org.user_company_access WHERE user_id = $1 AND company_id = $2`, [pair.userId, pair.companyId]);
        }
      }
      if (createdUserIds.length > 0) await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      await client.query("COMMIT");
      console.log("PASS: cleanup loads schema fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup loads schema fixtures -> ${String((error as Error)?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: loads schema verification complete.");
  process.exit(0);
}

console.error("FAIL: loads schema verification failed.");
process.exit(1);
