#!/usr/bin/env node
// verify-bills-mdata-vendor-fk (item 18) — asserts migration 202607220000 adds accounting.bills
// .mdata_vendor_id as a uuid FK -> the CANONICAL mdata.vendors (never mdata.qbo_vendors mirror / RETIRE)
// + an index, idempotently. Self-test: --selftest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607220000_bills_mdata_vendor_fk.sql";
export function check(sql) {
  const f = [];
  if (!/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+mdata_vendor_id\s+uuid\s+REFERENCES\s+mdata\.vendors\s*\(\s*id\s*\)/i.test(sql))
    f.push("must ADD COLUMN IF NOT EXISTS mdata_vendor_id uuid REFERENCES mdata.vendors(id)");
  if (/REFERENCES\s+mdata\.qbo_vendors/i.test(sql))
    f.push("FK must target mdata.vendors (AP truth), NOT the mdata.qbo_vendors mirror");
  if (!/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?bills\s*\(\s*mdata_vendor_id\s*\)/i.test(sql))
    f.push("must create a partial index on accounting.bills (mdata_vendor_id)");
  return f;
}
export function run() { try { return check(fs.readFileSync(path.join(ROOT, MIG), "utf8")); } catch { return [`${MIG} not found`]; } }
if (process.argv.includes("--selftest")) {
  const good = `ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS mdata_vendor_id uuid REFERENCES mdata.vendors(id);\nCREATE INDEX IF NOT EXISTS idx_bills_mdata_vendor ON accounting.bills (mdata_vendor_id) WHERE mdata_vendor_id IS NOT NULL;`;
  const mirror = good.replace("mdata.vendors(id)", "mdata.qbo_vendors(id)");
  const checks = [["canonical FK+index passes", check(good).length === 0], ["qbo_vendors mirror target caught", check(mirror).some((x) => /mirror/.test(x))]];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("FAIL"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:bills-mdata-vendor-fk --selftest PASS (${checks.length} checks)`); process.exit(0);
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { const f = run(); if (f.length) { console.error("verify:bills-mdata-vendor-fk FAIL:"); for (const x of f) console.error("  ✗ " + x); process.exit(1); } console.log("verify:bills-mdata-vendor-fk PASS"); }
