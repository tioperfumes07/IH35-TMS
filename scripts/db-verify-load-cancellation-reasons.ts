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
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
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
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
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
    const ownerRes = await client.query<{ id: string }>(
      `SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1`
    );
    if (ownerRes.rows.length === 0) throw new Error("Owner user missing");
    return {
      ownerUserId: ownerRes.rows[0].id,
      trkCompanyId: byCode.get("TRK")!,
      transpCompanyId: byCode.get("TRANSP")!,
      usmcaCompanyId: byCode.get("USMCA")!,
    };
  });

  results.push(
    await pass("Catalog table exists with required columns", async () => {
      await runWithBypass(client, async () => {
        const colsRes = await client.query<{ column_name: string }>(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'catalogs'
              AND table_name = 'load_cancellation_reasons'
          `
        );
        const cols = new Set(colsRes.rows.map((row) => row.column_name));
        for (const required of [
          "id",
          "operating_company_id",
          "reason_code",
          "display_name",
          "category",
          "is_active",
          "sort_order",
          "description",
          "created_at",
          "updated_at",
          "created_by_user_id",
        ]) {
          if (!cols.has(required)) throw new Error(`missing column ${required}`);
        }
      });
    })
  );

  results.push(
    await pass("Category enum exists with 4 values", async () => {
      await runWithBypass(client, async () => {
        const enumRes = await client.query<{ enumlabel: string }>(
          `
            SELECT e.enumlabel
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE n.nspname = 'catalogs'
              AND t.typname = 'cancellation_category_enum'
            ORDER BY e.enumsortorder
          `
        );
        const values = enumRes.rows.map((row) => row.enumlabel);
        const expected = ["customer_initiated", "carrier_initiated", "force_majeure", "other"];
        if (values.join("|") !== expected.join("|")) throw new Error(`enum mismatch: ${values.join(",")}`);
      });
    })
  );

  results.push(
    await pass("RLS policies present (select/insert/update)", async () => {
      await runWithBypass(client, async () => {
        const policyRes = await client.query<{ policyname: string }>(
          `
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'catalogs'
              AND tablename = 'load_cancellation_reasons'
          `
        );
        const names = new Set(policyRes.rows.map((row) => row.policyname));
        for (const expected of ["cancellation_reasons_select", "cancellation_reasons_insert", "cancellation_reasons_update"]) {
          if (!names.has(expected)) throw new Error(`missing policy ${expected}`);
        }
      });
    })
  );

  results.push(
    await pass("12 reasons seeded for each TRK/TRANSP/USMCA company", async () => {
      await runWithBypass(client, async () => {
        const countsRes = await client.query<{ code: string; cnt: number }>(
          `
            SELECT c.code, count(r.id)::int AS cnt
            FROM org.companies c
            LEFT JOIN catalogs.load_cancellation_reasons r ON r.operating_company_id = c.id
            WHERE c.code IN ('TRK', 'TRANSP', 'USMCA')
            GROUP BY c.code
            ORDER BY c.code
          `
        );
        const got = new Map(countsRes.rows.map((row) => [row.code, Number(row.cnt)]));
        for (const code of ["TRK", "TRANSP", "USMCA"]) {
          if ((got.get(code) ?? 0) !== 12) throw new Error(`${code} expected 12 rows, found ${String(got.get(code) ?? 0)}`);
        }
      });
    })
  );

  results.push(
    await pass("All 4 categories represented in seeded rows", async () => {
      await runWithBypass(client, async () => {
        const catRes = await client.query<{ category: string; cnt: number }>(
          `
            SELECT category::text AS category, count(*)::int AS cnt
            FROM catalogs.load_cancellation_reasons
            GROUP BY category
            ORDER BY category
          `
        );
        const categories = new Set(catRes.rows.map((row) => row.category));
        for (const category of ["customer_initiated", "carrier_initiated", "force_majeure", "other"]) {
          if (!categories.has(category)) throw new Error(`missing category ${category}`);
        }
      });
    })
  );

  const fixtures = await runWithBypass(client, async () => {
    const transpUserRes = await client.query<{ id: string }>(
      `
        INSERT INTO identity.users (email, google_user_id, role, default_company_id)
        VALUES ($1, $2, 'Manager', $3)
        RETURNING id
      `,
      [`cancel-reason-transp-${suffix}@example.com`, `cancel-reason-transp-${suffix}`, refs.transpCompanyId]
    );
    const trkUserRes = await client.query<{ id: string }>(
      `
        INSERT INTO identity.users (email, google_user_id, role, default_company_id)
        VALUES ($1, $2, 'Manager', $3)
        RETURNING id
      `,
      [`cancel-reason-trk-${suffix}@example.com`, `cancel-reason-trk-${suffix}`, refs.trkCompanyId]
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

    return { transpUserId, trkUserId };
  });

  results.push(
    await pass("Cross-company isolation enforced (TRANSP user cannot see TRK reasons)", async () => {
      await runAsUser(client, fixtures.transpUserId, async () => {
        const res = await client.query<{ code: string; cnt: number }>(
          `
            SELECT c.code, count(r.id)::int AS cnt
            FROM catalogs.load_cancellation_reasons r
            JOIN org.companies c ON c.id = r.operating_company_id
            GROUP BY c.code
          `
        );
        const seenCodes = res.rows.map((row) => row.code);
        if (seenCodes.length !== 1 || seenCodes[0] !== "TRANSP") {
          throw new Error(`TRANSP manager unexpectedly sees: ${seenCodes.join(",")}`);
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
      console.log("PASS: cleanup load cancellation reasons fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup load cancellation reasons fixtures -> ${String((error as Error)?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: load cancellation reasons verification complete.");
  process.exit(0);
}

console.error("FAIL: load cancellation reasons verification failed.");
process.exit(1);
