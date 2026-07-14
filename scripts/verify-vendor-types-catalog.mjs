#!/usr/bin/env node
// verify-vendor-types-catalog — asserts migration 202607420000 adds the per-entity catalogs.vendor_types
// catalog (FORCED entity RLS + no-DELETE grant + same-entity composite unique) and wires it to
// mdata.vendors via a SAME-ENTITY composite FK, WITHOUT dropping the existing vendor_type text column
// (additive-only). Static parse — no DB. Self-test: --selftest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607420000_vendor_types_catalog.sql";
export function check(rawSql) {
  // strip line comments so prose (e.g. "never DELETE") can't trip keyword regexes
  const sql = rawSql.replace(/--[^\n]*/g, "");
  const f = [];
  if (!/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+catalogs\.vendor_types/i.test(sql))
    f.push("must CREATE TABLE IF NOT EXISTS catalogs.vendor_types");
  if (!/operating_company_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+org\.companies\s*\(\s*id\s*\)/i.test(sql))
    f.push("catalogs.vendor_types must scope operating_company_id uuid NOT NULL REFERENCES org.companies(id)");
  if (!/FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql))
    f.push("catalogs.vendor_types must FORCE ROW LEVEL SECURITY");
  if (!/operating_company_id::text\s*=\s*current_setting\(\s*'app\.operating_company_id'/i.test(sql))
    f.push("RLS policy must be entity-scoped on app.operating_company_id");
  if (!/ADD\s+CONSTRAINT\s+uq_vendor_types_company_id\s+UNIQUE\s*\(\s*operating_company_id\s*,\s*id\s*\)/i.test(sql))
    f.push("must add composite UNIQUE (operating_company_id, id) to back the same-entity FK");
  if (!/GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+catalogs\.vendor_types\s+TO\s+ih35_app/i.test(sql))
    f.push("must GRANT SELECT, INSERT, UPDATE on catalogs.vendor_types to ih35_app");
  if (/GRANT[^;]*\bDELETE\b[^;]*ON\s+catalogs\.vendor_types/i.test(sql))
    f.push("must NOT grant DELETE on catalogs.vendor_types (void-not-delete)");
  // the catalogs schema has a default-privilege DELETE grant (0065) — a narrow GRANT is not enough;
  // an explicit REVOKE DELETE is required so the effective grant honours void-not-delete.
  if (!/REVOKE\s+DELETE\s+ON\s+catalogs\.vendor_types\s+FROM\s+ih35_app/i.test(sql))
    f.push("must REVOKE DELETE on catalogs.vendor_types FROM ih35_app (catalogs schema default-grants DELETE)");
  if (!/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+vendor_type_id\s+uuid/i.test(sql))
    f.push("must ADD COLUMN IF NOT EXISTS vendor_type_id uuid on mdata.vendors");
  if (!/FOREIGN\s+KEY\s*\(\s*operating_company_id\s*,\s*vendor_type_id\s*\)\s*REFERENCES\s+catalogs\.vendor_types\s*\(\s*operating_company_id\s*,\s*id\s*\)/i.test(sql))
    f.push("mdata.vendors link must be a SAME-ENTITY composite FK (operating_company_id, vendor_type_id) -> catalogs.vendor_types(operating_company_id, id)");
  if (/DROP\s+COLUMN[^;]*\bvendor_type\b/i.test(sql))
    f.push("must NOT drop the existing mdata.vendors.vendor_type text column (additive-only)");
  if (!/ON\s+CONFLICT\s*\(\s*operating_company_id\s*,\s*vendor_type_name\s*\)\s*DO\s+NOTHING/i.test(sql))
    f.push("seed must be idempotent (ON CONFLICT (operating_company_id, vendor_type_name) DO NOTHING)");
  return f;
}
export function run() { try { return check(fs.readFileSync(path.join(ROOT, MIG), "utf8")); } catch { return [`${MIG} not found`]; } }
if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const droppedText = good + "\nALTER TABLE mdata.vendors DROP COLUMN vendor_type;";
  const singleColFk = good.replace(
    /FOREIGN\s+KEY\s*\(\s*operating_company_id\s*,\s*vendor_type_id\s*\)\s*REFERENCES\s+catalogs\.vendor_types\s*\(\s*operating_company_id\s*,\s*id\s*\)/i,
    "FOREIGN KEY (vendor_type_id) REFERENCES catalogs.vendor_types (id)"
  );
  const withDelete = good.replace(
    /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+catalogs\.vendor_types\s+TO\s+ih35_app/i,
    "GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.vendor_types TO ih35_app"
  );
  const checks = [
    ["real migration passes", check(good).length === 0],
    ["dropping vendor_type text caught", check(droppedText).some((x) => /additive-only/.test(x))],
    ["single-col FK (cross-entity leak) caught", check(singleColFk).some((x) => /SAME-ENTITY composite FK/.test(x))],
    ["DELETE grant caught", check(withDelete).some((x) => /void-not-delete/.test(x))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("FAIL"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:vendor-types-catalog --selftest PASS (${checks.length} checks)`); process.exit(0);
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { const f = run(); if (f.length) { console.error("verify:vendor-types-catalog FAIL:"); for (const x of f) console.error("  ✗ " + x); process.exit(1); } console.log("verify:vendor-types-catalog PASS"); }
