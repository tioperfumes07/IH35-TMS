#!/usr/bin/env node
/**
 * USMCA-1 CI guard: switching app.operating_company_id partitions carrier-scoped rows.
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("verify:no-cross-carrier-data-leak FAIL: missing DATABASE_DIRECT_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

/** Tables known to enforce operating_company_id tenant RLS (not role-only policies). */
const SAMPLE_TABLES = [
  { schema: "mdata", table: "customers" },
  { schema: "mdata", table: "vendors" },
  { schema: "banking", table: "bank_accounts" },
];

async function withBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    return await fn();
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
}

async function countForCompany(client, companyId, schema, table) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
  const res = await client.query(
    `SELECT count(*)::int AS n FROM ${schema}.${table} WHERE operating_company_id = $1`,
    [companyId]
  );
  return Number(res.rows[0]?.n ?? 0);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET ROLE ih35_app");
    const companies = await withBypass(client, async () => {
      const res = await client.query(
        `SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'USMCA') ORDER BY code`
      );
      if (res.rows.length !== 2) throw new Error("Expected TRANSP and USMCA companies");
      return {
        transpId: String(res.rows[0].code === "TRANSP" ? res.rows[0].id : res.rows[1].id),
        usmcaId: String(res.rows[0].code === "USMCA" ? res.rows[0].id : res.rows[1].id),
      };
    });

    await client.query("BEGIN");
    try {
      for (const { schema, table } of SAMPLE_TABLES) {
        const transpCount = await countForCompany(client, companies.transpId, schema, table);
        const usmcaVisibleUnderTransp = await (async () => {
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
            companies.transpId,
          ]);
          const res = await client.query(
            `SELECT count(*)::int AS n FROM ${schema}.${table} WHERE operating_company_id = $1`,
            [companies.usmcaId]
          );
          return Number(res.rows[0]?.n ?? 0);
        })();

        if (usmcaVisibleUnderTransp > 0) {
          throw new Error(
            `${schema}.${table}: ${usmcaVisibleUnderTransp} USMCA rows visible under TRANSP session`
          );
        }

        const usmcaCount = await countForCompany(client, companies.usmcaId, schema, table);
        console.log(
          `  ${schema}.${table}: TRANSP=${transpCount} USMCA=${usmcaCount} (partition OK)`
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }

    console.log("verify:no-cross-carrier-data-leak PASS");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("verify:no-cross-carrier-data-leak FAIL:", err?.message ?? err);
  process.exit(1);
});
