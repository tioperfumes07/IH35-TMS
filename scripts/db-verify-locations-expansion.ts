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
      `SELECT id, code FROM org.companies WHERE code IN ('TRK', 'TRANSP', 'USMCA') ORDER BY code`
    );
    if (companiesRes.rows.length !== 3) throw new Error("Expected TRK/TRANSP/USMCA companies");
    const byCode = new Map(companiesRes.rows.map((row) => [row.code, row.id]));
    const ownerRes = await client.query<{ id: string }>(`SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1`);
    if (ownerRes.rows.length === 0) throw new Error("Owner user missing");
    return {
      ownerUserId: ownerRes.rows[0].id,
      trkCompanyId: byCode.get("TRK")!,
      transpCompanyId: byCode.get("TRANSP")!,
      usmcaCompanyId: byCode.get("USMCA")!,
    };
  });

  results.push(
    await pass("Locations table has all new expansion columns", async () => {
      await runWithBypass(client, async () => {
        const colsRes = await client.query<{ column_name: string }>(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'mdata'
              AND table_name = 'locations'
          `
        );
        const cols = new Set(colsRes.rows.map((row) => row.column_name));
        for (const required of [
          "location_type",
          "latitude",
          "longitude",
          "geocoded_at",
          "geocoding_source",
          "hours_of_operation_jsonb",
          "dock_count",
          "appointment_required",
          "appointment_lead_time_hours",
          "dock_high",
          "power_only_friendly",
          "drop_trailer_friendly",
          "phone",
          "notes",
          "security_instructions",
          "dock_instructions",
          "parking_instructions",
        ]) {
          if (!cols.has(required)) throw new Error(`missing locations column: ${required}`);
        }
      });
    })
  );

  results.push(
    await pass("location_type_enum exists with 20 values", async () => {
      await runWithBypass(client, async () => {
        const enumRes = await client.query<{ enumlabel: string }>(
          `
            SELECT e.enumlabel
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE n.nspname = 'mdata'
              AND t.typname = 'location_type_enum'
            ORDER BY e.enumsortorder
          `
        );
        if (enumRes.rows.length !== 20) throw new Error(`expected 20 enum values, found ${enumRes.rows.length}`);
      });
    })
  );

  results.push(
    await pass("location_contacts table exists with ON DELETE CASCADE FK", async () => {
      await runWithBypass(client, async () => {
        const colsRes = await client.query<{ column_name: string }>(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'mdata'
              AND table_name = 'location_contacts'
          `
        );
        if (colsRes.rows.length === 0) throw new Error("location_contacts missing");

        const fkRes = await client.query<{ confdeltype: string }>(
          `
            SELECT c.confdeltype
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'mdata'
              AND t.relname = 'location_contacts'
              AND c.contype = 'f'
              AND c.conname LIKE '%location_id%'
            LIMIT 1
          `
        );
        if (fkRes.rows.length === 0) throw new Error("location_contacts->locations FK missing");
        if (fkRes.rows[0].confdeltype !== "c") throw new Error("location_contacts FK is not ON DELETE CASCADE");
      });
    })
  );

  results.push(
    await pass("RLS policies exist on location_contacts", async () => {
      await runWithBypass(client, async () => {
        const policyRes = await client.query<{ policyname: string }>(
          `
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'mdata'
              AND tablename = 'location_contacts'
          `
        );
        const names = new Set(policyRes.rows.map((row) => row.policyname));
        for (const expected of ["location_contacts_select", "location_contacts_insert", "location_contacts_update"]) {
          if (!names.has(expected)) throw new Error(`missing policy ${expected}`);
        }
      });
    })
  );

  results.push(
    await pass("Indexes idx_locations_geocoded and idx_locations_type exist", async () => {
      await runWithBypass(client, async () => {
        const idxRes = await client.query<{ indexname: string }>(
          `
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'mdata'
              AND tablename = 'locations'
          `
        );
        const names = new Set(idxRes.rows.map((row) => row.indexname));
        if (!names.has("idx_locations_geocoded")) throw new Error("idx_locations_geocoded missing");
        if (!names.has("idx_locations_type")) throw new Error("idx_locations_type missing");
      });
    })
  );

  results.push(
    await pass("Seeded locations count is at least 9 for TRK/TRANSP/USMCA", async () => {
      await runWithBypass(client, async () => {
        const countRes = await client.query<{ code: string; cnt: number }>(
          `
            SELECT c.code, count(l.id)::int AS cnt
            FROM org.companies c
            LEFT JOIN mdata.locations l ON l.operating_company_id = c.id AND l.deactivated_at IS NULL
            WHERE c.code IN ('TRK', 'TRANSP', 'USMCA')
            GROUP BY c.code
            ORDER BY c.code
          `
        );
        const got = new Map(countRes.rows.map((row) => [row.code, Number(row.cnt)]));
        for (const code of ["TRK", "TRANSP", "USMCA"]) {
          if ((got.get(code) ?? 0) < 9) throw new Error(`${code} has fewer than 9 active locations`);
        }
      });
    })
  );

  results.push(
    await pass("Seed border crossings have power_only_friendly and drop_trailer_friendly", async () => {
      await runWithBypass(client, async () => {
        const seededBordersRes = await client.query<{ cnt: number }>(
          `
            SELECT count(*)::int AS cnt
            FROM mdata.locations
            WHERE location_name IN ('Laredo World Trade Bridge', 'Laredo Colombia Bridge', 'El Paso BOTA')
              AND location_type = 'border_crossing'::mdata.location_type_enum
              AND power_only_friendly = true
              AND drop_trailer_friendly = true
          `
        );
        const count = Number(seededBordersRes.rows[0]?.cnt ?? 0);
        if (count !== 9) throw new Error(`expected 9 seeded border crossings with flags, found ${count}`);
      });
    })
  );

  results.push(
    await pass("idx_locations_type is used on type-filter explain", async () => {
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        await client.query(`SELECT set_config('row_security', 'off', true)`);
        await client.query(`SELECT set_config('enable_seqscan', 'off', true)`);
        const explainRes = await client.query<{ "QUERY PLAN": string }>(
          `EXPLAIN SELECT id FROM mdata.locations WHERE location_type = 'fuel_stop'::mdata.location_type_enum`
        );
        const plan = explainRes.rows.map((row) => row["QUERY PLAN"]).join("\n");
        if (!plan.includes("idx_locations_type")) throw new Error("EXPLAIN plan did not include idx_locations_type");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
    })
  );

  const fixtures = await runWithBypass(client, async () => {
    const transpUserRes = await client.query<{ id: string }>(
      `
        INSERT INTO identity.users (email, google_user_id, role, default_company_id)
        VALUES ($1, $2, 'Manager', $3)
        RETURNING id
      `,
      [`loc-exp-transp-${suffix}@example.com`, `loc-exp-transp-${suffix}`, refs.transpCompanyId]
    );
    const trkUserRes = await client.query<{ id: string }>(
      `
        INSERT INTO identity.users (email, google_user_id, role, default_company_id)
        VALUES ($1, $2, 'Manager', $3)
        RETURNING id
      `,
      [`loc-exp-trk-${suffix}@example.com`, `loc-exp-trk-${suffix}`, refs.trkCompanyId]
    );
    const transpUserId = transpUserRes.rows[0].id;
    const trkUserId = trkUserRes.rows[0].id;
    createdUserIds.push(transpUserId, trkUserId);

    for (const pair of [
      { userId: transpUserId, companyId: refs.transpCompanyId },
      { userId: trkUserId, companyId: refs.trkCompanyId },
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

    return { transpUserId };
  });

  results.push(
    await pass("Cross-company isolation enforced for locations", async () => {
      await runAsUser(client, fixtures.transpUserId, async () => {
        const res = await client.query<{ code: string; cnt: number }>(
          `
            SELECT c.code, count(l.id)::int AS cnt
            FROM mdata.locations l
            JOIN org.companies c ON c.id = l.operating_company_id
            GROUP BY c.code
          `
        );
        const codes = res.rows.map((row) => row.code);
        if (codes.length !== 1 || codes[0] !== "TRANSP") {
          throw new Error(`TRANSP manager unexpectedly sees locations in: ${codes.join(",")}`);
        }
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
      if (createdAccessPairs.length > 0) {
        for (const pair of createdAccessPairs) {
          await client.query(`DELETE FROM org.user_company_access WHERE user_id = $1 AND company_id = $2`, [pair.userId, pair.companyId]);
        }
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
      console.log("PASS: cleanup locations expansion fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup locations expansion fixtures -> ${String((error as Error)?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: locations expansion verification complete.");
  process.exit(0);
}

console.error("FAIL: locations expansion verification failed.");
process.exit(1);
