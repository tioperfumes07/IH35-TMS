#!/usr/bin/env node
/**
 * USMCA-1 runtime guard: switching app.operating_company_id must partition carrier data.
 */
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("verify:no-cross-carrier-data-leak FAIL: DATABASE_DIRECT_URL required");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);

async function runWithBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function runScoped(client, companyId, fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function pass(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${name} -> ${String(err?.message || err)}`);
    return false;
  }
}

const TABLES = [
  {
    name: "mdata.customers",
    insert: (companyId, ownerId) => ({
      sql: `
        INSERT INTO mdata.customers (name, customer_code, operating_company_id, created_by_user_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      values: [`USMCA-1 Leak Test ${suffix}`, `USMCA1-${suffix}`, companyId, ownerId],
    }),
    countSql: `SELECT count(*)::int AS c FROM mdata.customers WHERE customer_code = $1`,
    keyParam: () => `USMCA1-${suffix}`,
  },
  {
    name: "catalogs.complaint_types",
    insert: (companyId) => ({
      sql: `
        INSERT INTO catalogs.complaint_types (operating_company_id, type_code, type_name, default_severity, is_active)
        VALUES ($1, $2, $3, 'info', true)
        RETURNING id
      `,
      values: [companyId, `USMCA1-${suffix}`, `USMCA-1 leak test ${suffix}`],
    }),
    countSql: `SELECT count(*)::int AS c FROM catalogs.complaint_types WHERE type_code = $1`,
    keyParam: () => `USMCA1-${suffix}`,
  },
];

const client = await pool.connect();
const results = [];
const createdIds = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const companiesRes = await client.query(
      `SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'USMCA')`
    );
    const byCode = new Map(companiesRes.rows.map((row) => [row.code, String(row.id)]));
    const transpId = byCode.get("TRANSP");
    const usmcaId = byCode.get("USMCA");
    if (!transpId || !usmcaId) throw new Error("TRANSP and USMCA companies required");

    const ownerRes = await client.query(`SELECT id FROM identity.users ORDER BY created_at ASC LIMIT 1`);
    if (ownerRes.rows.length === 0) throw new Error("No users found for leak test seed");
    return { transpId, usmcaId, ownerId: String(ownerRes.rows[0].id) };
  });

  for (const table of TABLES) {
    results.push(
      await pass(`${table.name} invisible across carriers`, async () => {
        const inserted = await runWithBypass(client, async () => {
          const payload = table.insert(refs.transpId, refs.ownerId);
          const res = await client.query(payload.sql, payload.values);
          const id = res.rows[0]?.id;
          if (id) createdIds.push({ table: table.name, id: String(id) });
          return id;
        });

        if (!inserted) throw new Error("fixture insert failed");

        const transpCount = await runScoped(client, refs.transpId, async () => {
          const res = await client.query(table.countSql, [table.keyParam()]);
          return Number(res.rows[0]?.c ?? 0);
        });
        if (transpCount !== 1) throw new Error(`expected 1 row under TRANSP, got ${transpCount}`);

        const usmcaCount = await runScoped(client, refs.usmcaId, async () => {
          const res = await client.query(table.countSql, [table.keyParam()]);
          return Number(res.rows[0]?.c ?? 0);
        });
        if (usmcaCount !== 0) {
          throw new Error(`cross-carrier leak: USMCA session saw ${usmcaCount} TRANSP rows in ${table.name}`);
        }
      })
    );
  }

  results.push(
    await pass("fake carrier UUID sees zero TRANSP customers", async () => {
      const fakeId = "00000000-0000-4000-8000-000000000001";
      const count = await runScoped(client, fakeId, async () => {
        const res = await client.query(`SELECT count(*)::int AS c FROM mdata.customers WHERE operating_company_id = $1`, [
          refs.transpId,
        ]);
        return Number(res.rows[0]?.c ?? 0);
      });
      if (count !== 0) throw new Error(`fake carrier session leaked ${count} TRANSP customer rows`);
    })
  );
} finally {
  await runWithBypass(client, async () => {
    for (const row of createdIds) {
      if (row.table === "mdata.customers") {
        await client.query(`DELETE FROM mdata.customers WHERE id = $1`, [row.id]);
      }
      if (row.table === "catalogs.complaint_types") {
        await client.query(`DELETE FROM catalogs.complaint_types WHERE id = $1`, [row.id]);
      }
    }
  }).catch(() => {});
  client.release();
  await pool.end();
}

if (results.some((ok) => !ok)) {
  console.error("verify:no-cross-carrier-data-leak FAIL");
  process.exit(1);
}

console.log("verify:no-cross-carrier-data-leak PASS");
