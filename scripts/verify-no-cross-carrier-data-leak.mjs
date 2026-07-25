#!/usr/bin/env node
/**
 * USMCA-1 runtime guard: switching app.operating_company_id must partition carrier data.
 *
 * LST-SEED-01 (2026-07-25) — this harness polluted PROD and had to be rebuilt. What went wrong:
 *
 *   1. NO PROD REFUSAL. It calls dotenv.config() and resolves DATABASE_DIRECT_URL || DATABASE_URL, and
 *      .env carries the prod Neon URL — so a local run silently targeted PRODUCTION. db-migrate.mjs has
 *      refused prod since 2026-06-28; this fixture writer never did. (CI was never the source: ci.yml
 *      points it at an ephemeral postgres:16-alpine on localhost.)
 *   2. IT COMMITTED ITS FIXTURES, then tried to DELETE them afterwards.
 *   3. That DELETE ran under `SET ROLE ih35_app`, which has no DELETE grant — so cleanup threw
 *      "permission denied" on EVERY run — and the error was swallowed by `.catch(() => {})`.
 *      Result: one orphaned `USMCA-1 leak test <hex>` row per run, 259 of them in live
 *      catalogs.complaint_types on TRANSP. A later audit misread the resulting 271/12/12 skew as a
 *      TRK/USMCA "seed gap" and a migration to seed the garbage everywhere reached PR #3452.
 *
 * The rebuild removes the whole failure class instead of patching it:
 *   - refuse a prod target BEFORE connecting (scripts/lib/prod-target-guard.mjs, no override flag);
 *   - run every fixture inside ONE transaction that is ALWAYS rolled back, so nothing is ever committed.
 *     Transaction-local set_config lets the GUC/bypass change between assertions without committing.
 *     Nothing to clean up means nothing can accumulate — even if the process is killed, Postgres rolls
 *     the transaction back on disconnect. It also needs no DELETE grant, so §F.24 (never DELETE business
 *     rows) is satisfied by construction rather than by permission;
 *   - assert afterwards, on a fresh connection, that no fixture row survived.
 */
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { assertNotProdTarget } from "./lib/prod-target-guard.mjs";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("verify:no-cross-carrier-data-leak FAIL: DATABASE_DIRECT_URL required");
  process.exit(1);
}

// Refuse PRODUCTION before a pool is opened or a row is written. This is the control whose absence
// put 259 test rows into live catalogs.complaint_types.
assertNotProdTarget({ label: "verify:no-cross-carrier-data-leak", connectionString });

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const FIXTURE_CODE = `USMCA1-${suffix}`;
const FIXTURE_NAME = `USMCA-1 leak test ${suffix}`;

/** Set a transaction-local GUC. All fixtures live in one never-committed transaction. */
const setLocal = (client, key, value) => client.query(`SELECT set_config($1, $2, true)`, [key, value]);
const bypassOn = (client) => setLocal(client, "app.bypass_rls", "lucia");
const bypassOff = (client) => setLocal(client, "app.bypass_rls", "");
const scopeTo = (client, companyId) => setLocal(client, "app.operating_company_id", companyId);

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
    name: "qbo_sync.drift_log",
    insert: (companyId) => ({
      sql: `
        INSERT INTO qbo_sync.drift_log (operating_company_id, entity_type, drift_type)
        VALUES ($1, 'customers', 'missing_local')
        RETURNING id
      `,
      values: [companyId],
    }),
    countSql: `SELECT count(*)::int AS c FROM qbo_sync.drift_log WHERE id = $1::uuid`,
  },
  {
    name: "catalogs.complaint_types",
    insert: (companyId) => ({
      sql: `
        INSERT INTO catalogs.complaint_types (operating_company_id, type_code, type_name, default_severity, is_active)
        VALUES ($1, $2, $3, 'info', true)
        RETURNING id
      `,
      values: [companyId, FIXTURE_CODE, FIXTURE_NAME],
    }),
    countSql: `SELECT count(*)::int AS c FROM catalogs.complaint_types WHERE type_code = $1`,
    keyParam: () => FIXTURE_CODE,
  },
];

const client = await pool.connect();
const results = [];
const fixtureIds = []; // {table, id} — checked for absence after ROLLBACK
let rolledBack = false;

try {
  await client.query("SET ROLE ih35_app");

  // ── ONE transaction for everything. It is NEVER committed. ────────────────────────────────────────
  await client.query("BEGIN");

  await bypassOn(client);
  const companiesRes = await client.query(
    `SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'USMCA')`,
  );
  const byCode = new Map(companiesRes.rows.map((row) => [row.code, String(row.id)]));
  const transpId = byCode.get("TRANSP");
  const usmcaId = byCode.get("USMCA");
  if (!transpId || !usmcaId) throw new Error("TRANSP and USMCA companies required");

  for (const table of TABLES) {
    results.push(
      await pass(`${table.name} invisible across carriers`, async () => {
        await bypassOn(client);
        const payload = table.insert(transpId);
        const res = await client.query(payload.sql, payload.values);
        const inserted = res.rows[0]?.id;
        if (!inserted) throw new Error("fixture insert failed");
        fixtureIds.push({ table: table.name, id: String(inserted) });

        const countArgs = table.keyParam ? [table.keyParam()] : [inserted];

        // Scoped reads must go through RLS, so the bypass is cleared first.
        await bypassOff(client);

        await scopeTo(client, transpId);
        const transpCount = Number((await client.query(table.countSql, countArgs)).rows[0]?.c ?? 0);
        if (transpCount !== 1) throw new Error(`expected 1 row under TRANSP, got ${transpCount}`);

        await scopeTo(client, usmcaId);
        const usmcaCount = Number((await client.query(table.countSql, countArgs)).rows[0]?.c ?? 0);
        if (usmcaCount !== 0) {
          throw new Error(`cross-carrier leak: USMCA session saw ${usmcaCount} TRANSP rows in ${table.name}`);
        }
      }),
    );
  }

  results.push(
    await pass("fake carrier UUID sees zero qbo_sync.drift_log rows", async () => {
      await bypassOff(client);
      await scopeTo(client, "00000000-0000-4000-8000-000000000001");
      const count = Number(
        (await client.query(`SELECT count(*)::int AS c FROM qbo_sync.drift_log WHERE entity_type = 'customers'`))
          .rows[0]?.c ?? 0,
      );
      if (count !== 0) throw new Error(`fake carrier session leaked ${count} drift_log row(s)`);
    }),
  );
} finally {
  // ROLLBACK is the cleanup. No DELETE, no grant needed, nothing committed — so nothing can accumulate.
  try {
    await client.query("ROLLBACK");
    rolledBack = true;
  } catch (err) {
    console.error(`FAIL: ROLLBACK failed -> ${String(err?.message || err)}`);
  }
  client.release();
}

// ── Independent post-run proof on a FRESH connection: the fixtures are genuinely gone. ──────────────
// This is the assertion whose absence let 259 rows pile up unnoticed. It is deliberately not inside the
// transaction above.
let residue = -1;
try {
  const verifier = await pool.connect();
  try {
    await verifier.query("BEGIN");
    await verifier.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    // Key on THIS run's exact fixture ids + type_code. A time window would false-fail on a concurrent
    // run, and pre-existing pollution from older runs is a separate finding, not this run's residue.
    const complaintIds = fixtureIds.filter((f) => f.table === "catalogs.complaint_types").map((f) => f.id);
    const driftIds = fixtureIds.filter((f) => f.table === "qbo_sync.drift_log").map((f) => f.id);
    const res = await verifier.query(
      `SELECT (SELECT count(*) FROM catalogs.complaint_types WHERE type_code = $1 OR id = ANY($2::uuid[]))
            + (SELECT count(*) FROM qbo_sync.drift_log WHERE id = ANY($3::uuid[])) AS c`,
      [FIXTURE_CODE, complaintIds, driftIds],
    );
    residue = Number(res.rows[0]?.c ?? 0);
    await verifier.query("ROLLBACK");
  } finally {
    verifier.release();
  }
} catch (err) {
  console.error(`FAIL: post-run residue check could not run -> ${String(err?.message || err)}`);
}

await pool.end();

if (!rolledBack) {
  console.error("verify:no-cross-carrier-data-leak FAIL: fixture transaction was not rolled back");
  process.exit(1);
}
if (residue !== 0) {
  console.error(
    `verify:no-cross-carrier-data-leak FAIL: ${residue} fixture row(s) survived (expected 0). ` +
      `Fixtures must never be committed. On any live database, soft-deactivate leftovers (is_active=false) — never DELETE (§F.24).`,
  );
  process.exit(1);
}
if (results.some((ok) => !ok)) {
  console.error("verify:no-cross-carrier-data-leak FAIL");
  process.exit(1);
}

console.log(`verify:no-cross-carrier-data-leak PASS — fixtures rolled back, 0 residue`);
