#!/usr/bin/env node
/**
 * ACCT-R-20 / db249-index-optimization-3 — three composite indexes must stay in the migration.
 *
 * Pre-fix defect: hot filters on safety_events / invoices / work_orders had only partial
 * indexes, so (driver+time), (customer+status+date), and (unit+status+opened) plans could not
 * use a matching composite. This guard locks the CREATE INDEX IF NOT EXISTS statements in
 * the additive migration so the indexes cannot silently disappear from the repo record.
 *
 * Live Neon presence is proved after owner apply (Rule 10) — this guard is the CI ratchet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-db249-index-optimization-3";
const MIGRATION = "db/migrations/202610331200_acct_r20_db249_composite_indexes.sql";

const REQUIRED = [
  {
    name: "idx_safety_events_company_driver_occurred",
    table: "safety.safety_events",
    cols: /operating_company_id\s*,\s*subject_driver_id\s*,\s*occurred_at/,
  },
  {
    name: "idx_invoices_customer_status_issue_date",
    table: "accounting.invoices",
    cols: /customer_id\s*,\s*status\s*,\s*issue_date/,
  },
  {
    name: "idx_work_orders_unit_status_opened",
    table: "maintenance.work_orders",
    cols: /unit_id\s*,\s*status\s*,\s*opened_at/,
  },
];

export function check(sql) {
  const f = [];
  if (!sql) {
    f.push(`${MIGRATION}: missing`);
    return f;
  }
  if (!/CREATE INDEX IF NOT EXISTS/i.test(sql)) {
    f.push(`${MIGRATION}: must use CREATE INDEX IF NOT EXISTS (idempotent)`);
  }
  if (/DROP INDEX|DROP TABLE|DELETE FROM/i.test(sql)) {
    f.push(`${MIGRATION}: must be additive — no DROP/DELETE`);
  }
  for (const req of REQUIRED) {
    if (!sql.includes(req.name)) {
      f.push(`${MIGRATION}: missing index name ${req.name}`);
      continue;
    }
    if (!sql.includes(req.table)) {
      f.push(`${MIGRATION}: ${req.name} must target ${req.table}`);
    }
    if (!req.cols.test(sql)) {
      f.push(`${MIGRATION}: ${req.name} must include composite columns matching ${req.cols}`);
    }
  }
  return f;
}

function read() {
  try {
    return fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");
  } catch {
    return null;
  }
}

function selftest() {
  const good = `
CREATE INDEX IF NOT EXISTS idx_safety_events_company_driver_occurred
  ON safety.safety_events (operating_company_id, subject_driver_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status_issue_date
  ON accounting.invoices (customer_id, status, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_unit_status_opened
  ON maintenance.work_orders (unit_id, status, opened_at DESC);
`;
  const cases = [
    ["healthy migration passes", check(good).length === 0],
    ["missing invoices composite caught", check(good.replace(/idx_invoices[\s\S]*?;/, "")).some((x) => x.includes("idx_invoices"))],
    ["DROP rejected", check(good + "\nDROP INDEX idx_invoices_customer_status_issue_date;").some((x) => x.includes("additive"))],
  ];
  const bad = cases.filter(([, ok]) => !ok);
  if (bad.length) {
    console.error(`${LABEL}: selftest FAIL`);
    for (const [n] of bad) console.error(" ", n);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const f = check(read());
  if (f.length) {
    console.error(`${LABEL}: FAIL`);
    for (const x of f) console.error(" -", x);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ACCT-R-20 composite indexes locked in ${MIGRATION}`);
}
