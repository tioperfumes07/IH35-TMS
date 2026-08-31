#!/usr/bin/env node
/**
 * REV E gate — one load maps to at most one open TMS A/R invoice.
 *
 * Spec: docs/specs/DEDUCTION-AND-DILUTION-CONTROL-SPEC-2026-08-30.md §9
 * Companion: scripts/verify-invoice-source-load-uniqueness-race.mjs (writer race / partial unique index)
 *
 * Live check: no source_load_id may have >1 active (non-void, non-draft) TMS invoice per opco.
 * Empty duplicate set is not vacuous — also asserts uq_invoices_source_load_active exists on prod.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";
import pgConnectionOptions from "./lib/pg-connection-options.cjs";

const { buildPgPoolConfig } = pgConnectionOptions;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-one-load-one-open-invoice";
const MIGRATION_FILE = "db/migrations/202613270100_dsp_money_f7175_uq_invoices_source_load_active.sql";

const OPEN_STATUSES = ["void", "voided", "draft"];

export function findDuplicateLoadInvoices(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.operating_company_id}:${row.source_load_id}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  return [...byKey.entries()].filter(([, n]) => n > 1).map(([key, n]) => ({ key, count: n }));
}

export function checkMigrationPresent(source) {
  return /uq_invoices_source_load_active/.test(source) && /source_load_id IS NOT NULL/.test(source);
}

async function queryDuplicates(client) {
  const res = await client.query(
    `SELECT i.operating_company_id, i.source_load_id, l.load_number, count(*)::int AS n
     FROM accounting.invoices i
     LEFT JOIN mdata.loads l
       ON l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id
     WHERE i.source_load_id IS NOT NULL
       AND i.voided_at IS NULL
       AND i.status <> ALL($1::text[])
       AND COALESCE(i.source_system, 'tms') = 'tms'
     GROUP BY i.operating_company_id, i.source_load_id, l.load_number
     HAVING count(*) > 1
     ORDER BY n DESC, l.load_number
     LIMIT 25`,
    [OPEN_STATUSES]
  );
  return res.rows;
}

async function assertIndexExists(client) {
  const res = await client.query(
    `SELECT 1
     FROM pg_indexes
     WHERE schemaname = 'accounting'
       AND tablename = 'invoices'
       AND indexname = 'uq_invoices_source_load_active'
     LIMIT 1`
  );
  return res.rows.length > 0;
}

if (process.argv.includes("--selftest")) {
  const dupes = findDuplicateLoadInvoices([
    { operating_company_id: "a", source_load_id: "l1" },
    { operating_company_id: "a", source_load_id: "l1" },
  ]);
  if (dupes.length !== 1 || dupes[0].count !== 2) {
    console.error(`${LABEL} --selftest FAIL: duplicate detector`);
    process.exit(1);
  }
  const clean = findDuplicateLoadInvoices([
    { operating_company_id: "a", source_load_id: "l1" },
    { operating_company_id: "a", source_load_id: "l2" },
  ]);
  if (clean.length !== 0) {
    console.error(`${LABEL} --selftest FAIL: false positive on clean set`);
    process.exit(1);
  }
  const mig = fs.readFileSync(path.join(ROOT, MIGRATION_FILE), "utf8");
  if (!checkMigrationPresent(mig)) {
    console.error(`${LABEL} --selftest FAIL: migration shape missing on disk`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!url) {
  console.error(`${LABEL} UNVERIFIED: DATABASE_URL not set`);
  process.exit(2);
}

const pool = new pg.Pool(buildPgPoolConfig(url));
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const indexOk = await assertIndexExists(client);
  if (!indexOk) {
    await client.query("ROLLBACK");
    console.error(`${LABEL} FAIL: uq_invoices_source_load_active missing on prod — apply migration 202613270100 first`);
    process.exit(1);
  }

  const dupes = await queryDuplicates(client);
  await client.query("COMMIT");

  if (dupes.length) {
    const detail = dupes
      .map((r) => `load ${r.load_number ?? r.source_load_id} opco=${r.operating_company_id} n=${r.n}`)
      .join("; ");
    console.error(`${LABEL} FAIL: >1 open TMS invoice on same load — ${detail}`);
    process.exit(1);
  }

  console.log(`${LABEL} PASS — zero loads with >1 open TMS invoice; partial unique index present`);
  process.exit(0);
} catch (e) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // ignore
  }
  console.error(`${LABEL} ERROR: ${e.message}`);
  process.exit(2);
} finally {
  client.release();
  await pool.end();
}
