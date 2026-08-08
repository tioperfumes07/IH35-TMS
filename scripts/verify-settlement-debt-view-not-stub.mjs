#!/usr/bin/env node
/**
 * verify-settlement-debt-view-not-stub.mjs
 *
 * SETTLE-DEBT-VIEW-STUB — views.driver_settlement_with_debt must be the real
 * settlements+drivers view, never the empty `WHERE false` stub that made every
 * settlement detail 404 on prod (2026-08-08).
 *
 * Static: migration file must CREATE the real view; must not leave stub-only.
 * Usage:
 *   node scripts/verify-settlement-debt-view-not-stub.mjs
 *   node scripts/verify-settlement-debt-view-not-stub.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = path.join(ROOT, "db/migrations");
const LABEL = "verify-settlement-debt-view-not-stub";
const TARGET = "202608082248_restore_driver_settlement_with_debt_view.sql";

export function check({ migSrc }) {
  const f = [];
  if (!migSrc) {
    f.push(`${TARGET}: missing`);
    return f;
  }
  if (!/CREATE\s+VIEW\s+views\.driver_settlement_with_debt/i.test(migSrc)) {
    f.push(`${TARGET}: must CREATE VIEW views.driver_settlement_with_debt`);
  }
  if (!/FROM\s+driver_finance\.driver_settlements/i.test(migSrc)) {
    f.push(`${TARGET}: view must read driver_finance.driver_settlements`);
  }
  if (!/JOIN\s+mdata\.drivers/i.test(migSrc)) {
    f.push(`${TARGET}: view must JOIN mdata.drivers`);
  }
  if (/WHERE\s+false/i.test(migSrc) && !/driver_finance\.driver_settlements/i.test(migSrc)) {
    f.push(`${TARGET}: stub-only WHERE false without real settlements source`);
  }
  // Must not reintroduce the broken deduction_schedule ack columns in executable SQL.
  // Strip -- comments first so the migration header (which names the defect) cannot false-red.
  const sqlOnly = migSrc
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  if (/deduction_schedule[\s\S]*requires_acknowledgment/i.test(sqlOnly)) {
    f.push(`${TARGET}: must not reference deduction_schedule.requires_acknowledgment (column does not exist)`);
  }
  if (!/security_invoker\s*=\s*true/i.test(migSrc)) {
    f.push(`${TARGET}: view must use security_invoker = true`);
  }
  return f;
}

export function run() {
  const p = path.join(MIG_DIR, TARGET);
  const migSrc = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  return check({ migSrc });
}

function selftest() {
  const good = {
    migSrc: `
DROP VIEW IF EXISTS views.driver_settlement_with_debt;
CREATE VIEW views.driver_settlement_with_debt WITH (security_invoker = true) AS
SELECT s.id FROM driver_finance.driver_settlements s JOIN mdata.drivers d ON d.id = s.driver_id;
`,
  };
  const badStub = {
    migSrc: `
CREATE VIEW views.driver_settlement_with_debt AS
SELECT NULL::uuid AS id WHERE false;
`,
  };
  const badCols = {
    migSrc: `
CREATE VIEW views.driver_settlement_with_debt WITH (security_invoker = true) AS
SELECT s.id, EXISTS (
  SELECT 1 FROM driver_finance.deduction_schedule ds
  WHERE ds.requires_acknowledgment = true
) AS has_pending_acks
FROM driver_finance.driver_settlements s JOIN mdata.drivers d ON d.id = s.driver_id;
`,
  };
  const cases = [
    { name: "good", src: good, want: 0 },
    { name: "stub", src: badStub, wantMin: 1 },
    { name: "badCols", src: badCols, wantMin: 1 },
  ];
  for (const c of cases) {
    const fails = check(c.src);
    const ok =
      c.want != null ? fails.length === c.want : fails.length >= (c.wantMin ?? 1);
    if (!ok) {
      console.error(`${LABEL} --selftest FAIL ${c.name}: ${fails.join("; ") || "(no fails)"}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const fails = run();
  if (fails.length) {
    console.error(`${LABEL} FAIL`);
    for (const x of fails) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
