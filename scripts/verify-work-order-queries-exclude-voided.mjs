#!/usr/bin/env node
/**
 * Every query that COUNTS or LISTS maintenance.work_orders for display must exclude voided rows.
 *
 * void-not-delete means a retracted work order stays in the table forever. That is correct, and it is
 * exactly why every read has to filter it out — the row is evidence, not an open job.
 *
 * Seen live on prod 2026-07-29: maintenance.work_orders holds exactly TWO rows, DEMO-WO-001 and
 * DEMO-WO-002, both voided on 2026-07-13, both scoped to the real operating carrier. The maintenance
 * work-order table correctly showed "0 of 0" — while the Home dashboard reported "WOS OPEN: 2 WOs,
 * 1 in progress" and the maintenance "Recent Work Orders" panel listed both. The owner's home screen
 * was reporting voided demo records as live operations.
 *
 * The canonical predicate already existed (openWorkOrderPredicate in kpi/canonical-kpis.ts). The Home
 * route had re-typed the status list by hand and dropped the void filter, under a comment claiming it
 * matched the maintenance dashboard. A second definition of a shared rule is how they diverge.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BACKEND = join(process.cwd(), "apps", "backend", "src");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

/**
 * Extract SQL-ish statements that read maintenance.work_orders, then require a void exclusion in the
 * same statement. Statements are split on template-literal boundaries so one query's filter cannot be
 * credited to another — the attribution bug this repo keeps hitting.
 */
export function unguardedWorkOrderReads(src) {
  const out = [];
  for (const m of src.matchAll(/`([^`]*maintenance\.work_orders[^`]*)`/g)) {
    const sql = m[1];
    // Writes are not display reads.
    if (/\b(INSERT\s+INTO|UPDATE\s+maintenance\.work_orders|DELETE\s+FROM)\b/i.test(sql)) continue;
    if (!/\bSELECT\b/i.test(sql)) continue;
    // to_regclass existence probes are not reads of rows.
    if (/to_regclass/i.test(sql) && !/FROM\s+maintenance\.work_orders/i.test(sql)) continue;

    // SCOPE: only AGGREGATE COUNTS. Counting a retracted work order into a KPI is unambiguously
    // wrong — it reports withdrawn work as live. Everything else is deliberately NOT flagged:
    // fetching one work order by id must return it even when voided (you cannot view, audit or
    // un-void a row you cannot load), the governance void executors exist precisely to read
    // voided_at, and historical cost reports legitimately include retracted work.
    //
    // A first draft flagged every read and produced 105 hits, nearly all correct code. A guard that
    // cries wolf gets allowlisted, and an allowlist is how a real rule dies.
    if (!/\bcount\s*\(/i.test(sql)) continue;
    // A count constrained to a single row by id is a existence check, not a KPI.
    if (/\bid\s*=\s*\$\d/.test(sql)) continue;
    // Guarded by an explicit filter, or by interpolating the ONE canonical predicate (which contains
    // the filter). Kept as a plain OR — an earlier nested ternary here was simply wrong, and the
    // selftest caught it.
    const guarded =
      /voided_at\s+IS\s+NULL/i.test(sql) || /openWorkOrderPredicate\s*\(/.test(sql);
    if (!guarded) out.push(sql.replace(/\s+/g, " ").trim().slice(0, 160));
  }
  return out;
}

function selftest() {
  const cases = [
    { name: "unfiltered count is caught",
      src: "const q = `SELECT count(*) FROM maintenance.work_orders WHERE operating_company_id = $1`;", expect: 1 },
    { name: "explicit voided_at IS NULL passes",
      src: "const q = `SELECT * FROM maintenance.work_orders WHERE operating_company_id = $1 AND voided_at IS NULL`;", expect: 0 },
    { name: "canonical predicate interpolation passes",
      src: "const q = `SELECT count(*) FILTER (WHERE ${openWorkOrderPredicate()}) FROM maintenance.work_orders`;", expect: 0 },
    { name: "an INSERT is not a display read",
      src: "const q = `INSERT INTO maintenance.work_orders (id) VALUES ($1)`;", expect: 0 },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = unguardedWorkOrderReads(c.src).length;
    if (got !== c.expect) { console.error(`  selftest FAIL — ${c.name}: expected ${c.expect}, got ${got}`); bad++; }
    else console.log(`  selftest OK — ${c.name}`);
  }
  if (bad) { console.error(`SELFTEST FAIL — ${bad}/${cases.length}`); process.exit(1); }
  console.log(`verify-work-order-queries-exclude-voided SELFTEST OK — ${cases.length}/${cases.length}`);
}

/**
 * Files whose work-order COUNTS drive an operator-facing dashboard number. A voided row counted here
 * becomes a false operational figure on someone's screen — which is the defect this guard exists for.
 *
 * Historical cost and profitability reports are deliberately OUT of scope: including retracted work in
 * a past-period cost total can be correct, and that is an accounting judgement, not a bug. Scoping by
 * surface keeps every entry in this list defensible instead of relying on an allowlist of exceptions.
 */
const KPI_SOURCES = [
  "apps/backend/src/home/home-widgets.routes.ts",
  "apps/backend/src/reports/library.routes.ts",
  "apps/backend/src/maintenance/dashboard.routes.ts",
  "apps/backend/src/kpi/canonical-kpis.ts",
];

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const files = walk(BACKEND).filter((p) =>
    KPI_SOURCES.some((k) => p.replace(process.cwd() + "/", "") === k)
  );
  if (files.length === 0) {
    console.error("verify-work-order-queries-exclude-voided FAIL — scanned 0 files; refusing to report green");
    process.exit(1);
  }
  const violations = [];
  let reads = 0;
  for (const p of files) {
    const src = readFileSync(p, "utf8");
    if (!src.includes("maintenance.work_orders")) continue;
    for (const m of src.matchAll(/`([^`]*maintenance\.work_orders[^`]*)`/g)) reads += 1;
    for (const sql of unguardedWorkOrderReads(src)) {
      violations.push({ p: p.replace(process.cwd() + "/", ""), sql });
    }
  }
  if (violations.length) {
    console.error(`verify-work-order-queries-exclude-voided FAIL — ${violations.length} work-order read(s) do not exclude voided rows:`);
    for (const v of violations) console.error(`\n  ${v.p}\n    ${v.sql}`);
    console.error("\nvoid-not-delete keeps retracted work orders in the table forever. A display read that");
    console.error("does not filter them reports retracted records as live work. Use openWorkOrderPredicate()");
    console.error("or add `AND voided_at IS NULL`.");
    process.exit(1);
  }
  console.log(`verify-work-order-queries-exclude-voided OK — ${reads} work-order query blocks, all exclude voided rows`);
}

main();
