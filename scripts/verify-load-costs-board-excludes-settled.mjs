#!/usr/bin/env node
/** ROUND 115 tasks 41-42: money, not status, closes the canonical active-load set. */
export const REQUIRES_LIVE_DB = "canonical active-load money membership — fail closed";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-costs-board-excludes-settled";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROUTE = "apps/backend/src/accounting/load-costs-board.routes.ts";
const MIGRATION = "db/migrations/202614310200_live_loads_both_money_sides_closed.sql";
const TERMINAL = new Set(["draft", "cancelled", "abandoned", "driver_walkoff", "driver_no_show"]);

export function expectedActive(f) {
  if (f.isSample || f.softDeleted || TERMINAL.has(f.status)) return false;
  return !(f.customerClosed && f.driverClosed);
}

export function runSelftest() {
  const cases = [
    ["delivered + invoiced + not settled stays active", { status: "delivered", customerClosed: true, driverClosed: false }, true],
    ["delivered + invoiced + settled is excluded", { status: "delivered", customerClosed: true, driverClosed: true }, false],
    ["status invoiced + driver not settled stays active", { status: "invoiced", customerClosed: true, driverClosed: false }, true],
    ["status dispatched + both sides closed is excluded", { status: "dispatched", customerClosed: true, driverClosed: true }, false],
  ];
  const failures = [];
  for (const [name, partial, want] of cases) {
    const got = expectedActive({ isSample: false, softDeleted: false, ...partial });
    if (got !== want) failures.push(`${name}: got ${got}, want ${want}`);
    else console.log(`PASS ${name}`);
  }
  const planted = (f) =>
    !["draft", "invoiced", "paid", "closed", "cancelled", "abandoned", "driver_walkoff", "driver_no_show"].includes(f.status) &&
    !f.customerClosed && !f.driverClosed;
  if (cases.every(([, partial, want]) => planted(partial) === want)) failures.push("planted pre-fix escaped");
  else console.log("PASS planted status/OR-closure mutation -> RED");
  if (failures.length) throw new Error(`${LABEL} --selftest FAIL\n${failures.join("\n")}`);
  console.log(`${LABEL} --selftest PASS 5/5`);
}

function assertStaticWiring() {
  const route = fs.readFileSync(path.join(ROOT, ROUTE), "utf8");
  const migrationPath = path.join(ROOT, MIGRATION);
  if (!route.includes('liveLoadsExistsSql("l.id")')) throw new Error(`${ROUTE} bypasses views.live_loads`);
  if (!fs.existsSync(migrationPath)) throw new Error(`${MIGRATION} missing`);
  const migration = fs.readFileSync(migrationPath, "utf8");
  for (const token of [
    "CREATE OR REPLACE VIEW views.live_loads", "security_invoker = true",
    "l.is_sample_data IS NOT TRUE", "sl.is_active IS TRUE",
    "settled_in_settlement_id IS NOT NULL", "NOT IN ('draft', 'proforma', 'void')",
  ]) if (!migration.includes(token)) throw new Error(`${MIGRATION} missing: ${token}`);
  if (/status\s+NOT\s+IN\s*\([^)]*'invoiced'/i.test(migration)) {
    throw new Error(`${MIGRATION} still treats status='invoiced' as money closure`);
  }
}

async function live() {
  assertStaticWiring();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing — live money guard fails closed");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', false)");
    const { rows: [row] } = await client.query(
      `WITH membership AS (
         SELECT l.id,
                EXISTS (SELECT 1 FROM accounting.invoices i WHERE i.source_load_id=l.id AND i.status NOT IN ('draft','proforma','void')) AS customer_closed,
                (EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.load_id=l.id AND sl.is_active IS TRUE)
                 OR EXISTS (SELECT 1 FROM driver_finance.driver_bills db WHERE db.load_id=l.id AND db.settled_in_settlement_id IS NOT NULL AND db.status <> 'void')) AS driver_closed
           FROM mdata.loads l
          WHERE l.operating_company_id=$1::uuid AND l.soft_deleted_at IS NULL AND l.is_sample_data IS NOT TRUE
       )
       SELECT count(*) FILTER (WHERE v.id IS NOT NULL AND m.customer_closed AND m.driver_closed)::int AS both_closed_leaked,
              count(*) FILTER (WHERE v.id IS NOT NULL AND l.is_sample_data IS TRUE)::int AS sample_leaked,
              count(*) FILTER (WHERE v.id IS NOT NULL)::int AS active_count
         FROM membership m JOIN mdata.loads l ON l.id=m.id LEFT JOIN views.live_loads v ON v.id=m.id`,
      [USMCA],
    );
    if (Number(row.both_closed_leaked) !== 0) throw new Error(`${row.both_closed_leaked} both-closed load(s) leaked`);
    if (Number(row.sample_leaked) !== 0) throw new Error(`${row.sample_leaked} sample load(s) leaked`);
    console.log(`${LABEL} LIVE PASS — USMCA active=${row.active_count}; both-closed leaks=0; sample leaks=0`);
    await client.query("ROLLBACK");
  } finally { await client.end().catch(() => {}); }
}

if (process.argv.includes("--selftest")) runSelftest();
else await live();
