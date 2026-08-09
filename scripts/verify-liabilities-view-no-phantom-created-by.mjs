#!/usr/bin/env node
/**
 * verify-liabilities-view-no-phantom-created-by.mjs
 *
 * ACCT-F272-DEPLOY-BLOCKER — migration 202612440000 must not SELECT
 * driver_liabilities.created_by_user_id (column does not exist on prod). That
 * phantom reference failed CREATE OR REPLACE VIEW, aborted Render preDeploy,
 * and froze prod at healthz 02bab31.
 *
 * Usage:
 *   node scripts/verify-liabilities-view-no-phantom-created-by.mjs
 *   node scripts/verify-liabilities-view-no-phantom-created-by.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG =
  "db/migrations/202612440000_liabilities_active_view_real_columns.sql";
const LABEL = "verify-liabilities-view-no-phantom-created-by";

function sqlOnly(src) {
  return src
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

export function check({ migSrc }) {
  const f = [];
  if (!migSrc) {
    f.push(`${MIG}: missing`);
    return f;
  }
  const body = sqlOnly(migSrc);
  if (/\bl\.created_by_user_id\b/.test(body)) {
    f.push(
      `${MIG}: must not select l.created_by_user_id (column absent on prod driver_liabilities)`
    );
  }
  if (!/NULL\s*::\s*uuid\s+AS\s+created_by_user_id/i.test(body)) {
    f.push(
      `${MIG}: must emit NULL::uuid AS created_by_user_id (preserve view shape)`
    );
  }
  if (!/CREATE\s+OR\s+REPLACE\s+VIEW\s+views\.liabilities_active_with_context/i.test(migSrc)) {
    f.push(`${MIG}: must CREATE OR REPLACE VIEW views.liabilities_active_with_context`);
  }
  return f;
}

export function run() {
  const p = path.join(ROOT, MIG);
  const migSrc = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  return check({ migSrc });
}

function selftest() {
  const good = {
    migSrc: `
CREATE OR REPLACE VIEW views.liabilities_active_with_context AS
SELECT l.id, NULL::uuid AS created_by_user_id FROM driver_finance.driver_liabilities l;
`,
  };
  const badCol = {
    migSrc: `
CREATE OR REPLACE VIEW views.liabilities_active_with_context AS
SELECT l.id, l.created_by_user_id FROM driver_finance.driver_liabilities l;
`,
  };
  const badMissingNull = {
    migSrc: `
CREATE OR REPLACE VIEW views.liabilities_active_with_context AS
SELECT l.id FROM driver_finance.driver_liabilities l;
`,
  };
  const g = check(good);
  const b1 = check(badCol);
  const b2 = check(badMissingNull);
  if (g.length) throw new Error(`${LABEL} --selftest good failed: ${g.join("; ")}`);
  if (!b1.length) throw new Error(`${LABEL} --selftest badCol should fail`);
  if (!b2.length) throw new Error(`${LABEL} --selftest badMissingNull should fail`);
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const fails = run();
  if (fails.length) {
    console.error(`${LABEL} FAIL:`);
    for (const x of fails) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
