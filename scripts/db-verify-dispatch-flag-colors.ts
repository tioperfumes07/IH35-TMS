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
    await pass("dispatch_flag_colors table has required columns/constraints", async () => {
      await runWithBypass(client, async () => {
        const colsRes = await client.query<{ column_name: string }>(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema='catalogs'
              AND table_name='dispatch_flag_colors'
          `
        );
        const cols = new Set(colsRes.rows.map((row) => row.column_name));
        for (const required of [
          "id",
          "operating_company_id",
          "flag_code",
          "display_name",
          "hex_color",
          "icon_emoji",
          "severity_order",
          "description",
          "is_active",
          "sort_order",
          "created_at",
          "updated_at",
          "created_by_user_id",
        ]) {
          if (!cols.has(required)) throw new Error(`missing column ${required}`);
        }
        const constraintsRes = await client.query<{ conname: string }>(
          `
            SELECT conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'catalogs'
              AND t.relname = 'dispatch_flag_colors'
              AND c.contype = 'c'
          `
        );
        const names = new Set(constraintsRes.rows.map((row) => row.conname));
        if (!names.has("chk_flag_severity")) throw new Error("missing chk_flag_severity");
        if (!names.has("chk_flag_hex_format")) throw new Error("missing chk_flag_hex_format");
      });
    })
  );

  results.push(
    await pass("chk_flag_severity rejects values outside 0-100", async () => {
      await runWithBypass(client, async () => {
        try {
          await client.query(
            `
              INSERT INTO catalogs.dispatch_flag_colors (
                operating_company_id, flag_code, display_name, hex_color, severity_order, sort_order, created_by_user_id
              )
              VALUES ($1, $2, $3, '#10b981', 101, 999, $4)
            `,
            [refs.transpCompanyId, `SEV_FAIL_${suffix.toUpperCase()}`, "severity fail", refs.ownerUserId]
          );
          throw new Error("expected severity constraint rejection");
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "23514") throw error;
        }
      });
    })
  );

  results.push(
    await pass("chk_flag_hex_format rejects invalid hex values", async () => {
      for (const invalidHex of ["red", "#ZZZZZZ", "#FFF"]) {
        await runWithBypass(client, async () => {
          try {
            await client.query(
              `
                INSERT INTO catalogs.dispatch_flag_colors (
                  operating_company_id, flag_code, display_name, hex_color, severity_order, sort_order, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, 20, 999, $5)
              `,
              [refs.transpCompanyId, `HEX_FAIL_${invalidHex.replace(/[^A-Za-z0-9]/g, "")}_${suffix.toUpperCase()}`, "hex fail", invalidHex, refs.ownerUserId]
            );
            throw new Error(`expected hex constraint rejection for ${invalidHex}`);
          } catch (error) {
            const code = (error as { code?: string }).code;
            if (code !== "23514") throw error;
          }
        });
      }
    })
  );

  results.push(
    await pass("RLS policies present (select/insert/update)", async () => {
      await runWithBypass(client, async () => {
        const policyRes = await client.query<{ policyname: string }>(
          `
            SELECT policyname
            FROM pg_policies
            WHERE schemaname='catalogs'
              AND tablename='dispatch_flag_colors'
          `
        );
        const names = new Set(policyRes.rows.map((row) => row.policyname));
        for (const expected of ["dispatch_flags_select", "dispatch_flags_insert", "dispatch_flags_update"]) {
          if (!names.has(expected)) throw new Error(`missing policy ${expected}`);
        }
      });
    })
  );

  results.push(
    await pass("8 seeded flags exist for TRK/TRANSP/USMCA (24 total)", async () => {
      await runWithBypass(client, async () => {
        const perCompanyRes = await client.query<{ code: string; cnt: number }>(
          `
            SELECT c.code, count(f.id)::int AS cnt
            FROM org.companies c
            LEFT JOIN catalogs.dispatch_flag_colors f ON f.operating_company_id = c.id
            WHERE c.code IN ('TRK', 'TRANSP', 'USMCA')
            GROUP BY c.code
            ORDER BY c.code
          `
        );
        const got = new Map(perCompanyRes.rows.map((row) => [row.code, Number(row.cnt)]));
        for (const code of ["TRK", "TRANSP", "USMCA"]) {
          if ((got.get(code) ?? 0) !== 8) throw new Error(`${code} expected 8 rows, found ${String(got.get(code) ?? 0)}`);
        }
        const totalRes = await client.query<{ total: number }>(
          `
            SELECT count(*)::int AS total
            FROM catalogs.dispatch_flag_colors
            WHERE operating_company_id IN (
              SELECT id
              FROM org.companies
              WHERE code IN ('TRK', 'TRANSP', 'USMCA')
            )
          `
        );
        if (Number(totalRes.rows[0]?.total ?? 0) !== 24) throw new Error("seed total is not 24");
      });
    })
  );

  results.push(
    await pass("All 8 standard flag codes are present", async () => {
      await runWithBypass(client, async () => {
        const codesRes = await client.query<{ flag_code: string }>(
          `
            SELECT DISTINCT flag_code
            FROM catalogs.dispatch_flag_colors
            WHERE operating_company_id = $1
            ORDER BY flag_code
          `,
          [refs.transpCompanyId]
        );
        const got = new Set(codesRes.rows.map((row) => row.flag_code));
        for (const code of ["GRAY", "GREEN", "BLUE", "YELLOW", "ORANGE", "RED", "PURPLE", "BLACK"]) {
          if (!got.has(code)) throw new Error(`missing standard code ${code}`);
        }
      });
    })
  );

  const fixtures = await runWithBypass(client, async () => {
    const transpManagerRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Manager',$3) RETURNING id`,
      [`flag-mgr-transp-${suffix}@example.com`, `flag-mgr-transp-${suffix}`, refs.transpCompanyId]
    );
    const trkManagerRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Manager',$3) RETURNING id`,
      [`flag-mgr-trk-${suffix}@example.com`, `flag-mgr-trk-${suffix}`, refs.trkCompanyId]
    );
    const transpManagerId = transpManagerRes.rows[0].id;
    const trkManagerId = trkManagerRes.rows[0].id;
    createdUserIds.push(transpManagerId, trkManagerId);

    for (const pair of [
      { userId: transpManagerId, companyId: refs.transpCompanyId },
      { userId: trkManagerId, companyId: refs.trkCompanyId },
    ]) {
      await client.query(
        `INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO NOTHING`,
        [pair.userId, pair.companyId, refs.ownerUserId]
      );
      createdAccessPairs.push(pair);
    }

    return { transpManagerId };
  });

  results.push(
    await pass("Cross-company isolation enforced", async () => {
      await runAsUser(client, fixtures.transpManagerId, async () => {
        const res = await client.query<{ code: string }>(
          `
            SELECT DISTINCT c.code
            FROM catalogs.dispatch_flag_colors f
            JOIN org.companies c ON c.id = f.operating_company_id
            ORDER BY c.code
          `
        );
        const codes = res.rows.map((row) => row.code);
        if (codes.length !== 1 || codes[0] !== "TRANSP") {
          throw new Error(`TRANSP manager unexpectedly sees companies: ${codes.join(",")}`);
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
      console.log("PASS: cleanup dispatch flag colors fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup dispatch flag colors fixtures -> ${String((error as Error)?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: dispatch flag colors verification complete.");
  process.exit(0);
}

console.error("FAIL: dispatch flag colors verification failed.");
process.exit(1);
