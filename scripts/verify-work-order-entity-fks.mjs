#!/usr/bin/env node
// verify-work-order-entity-fks (P4-06) — asserts migration 202607230000 adds maintenance.work_orders
// unit_id -> mdata.units + driver_id -> mdata.drivers FKs (canonical hubs, NOT RETIRE), NOT VALID,
// idempotent. Self-test: --selftest.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607230000_work_orders_unit_driver_fk.sql";
export function check(sql) {
  const f = [];
  if (!/FOREIGN\s+KEY\s*\(\s*unit_id\s*\)\s*REFERENCES\s+mdata\.units\s*\(\s*id\s*\)/i.test(sql)) f.push("must add FK work_orders.unit_id -> mdata.units(id)");
  if (!/FOREIGN\s+KEY\s*\(\s*driver_id\s*\)\s*REFERENCES\s+mdata\.drivers\s*\(\s*id\s*\)/i.test(sql)) f.push("must add FK work_orders.driver_id -> mdata.drivers(id)");
  if (/REFERENCES\s+mdata\.qbo_vendors/i.test(sql)) f.push("must NOT FK the mdata.qbo_vendors mirror (canonical AP = mdata.vendors)");
  if (!/NOT\s+VALID/i.test(sql)) f.push("FKs must be NOT VALID (safe against orphans; GUARD VALIDATEs on Neon)");
  if (!/pg_constraint/i.test(sql)) f.push("must be idempotent (pg_constraint guard)");
  return f;
}
export function run() { try { return check(fs.readFileSync(path.join(ROOT, MIG), "utf8")); } catch { return [`${MIG} not found`]; } }
if (process.argv.includes("--selftest")) {
  const good = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='a') THEN ALTER TABLE maintenance.work_orders ADD CONSTRAINT a FOREIGN KEY (unit_id) REFERENCES mdata.units(id) NOT VALID; END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='b') THEN ALTER TABLE maintenance.work_orders ADD CONSTRAINT b FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id) NOT VALID; END IF; END $$;`;
  const checks = [["both FKs+NOTVALID+idempotent passes", check(good).length === 0], ["missing driver FK caught", check(good.replace(/driver_id/g,"x")).length > 0]];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("FAIL"); for (const [n] of failed) console.error("  ✗ "+n); process.exit(1); }
  console.log(`verify:work-order-entity-fks --selftest PASS (${checks.length} checks)`); process.exit(0);
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { const f = run(); if (f.length) { console.error("verify:work-order-entity-fks FAIL:"); for (const x of f) console.error("  ✗ "+x); process.exit(1); } console.log("verify:work-order-entity-fks PASS"); }
