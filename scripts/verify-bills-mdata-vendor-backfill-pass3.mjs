#!/usr/bin/env node
/**
 * ACCT-F73-PASS3 — the two bills deliberately left NULL in pass 1 must be backfilled once
 * vendors_pull succeeds and QBO vendor 2244 exists in mdata.vendors.
 *
 * WHY PASS 3 IS SEPARATE: pass 1 (202611090000) resolved 16,243 bills via QBO-id match and left
 * vendor 2244 NULL because the mirror row did not exist yet. PR #3993 fixed vendors_pull; this
 * migration re-runs the same idempotent QBO-id join for any bill still NULL — no ::uuid cast,
 * no relink of already-set rows, entity-scoped on operating_company_id.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const LABEL = "verify-bills-mdata-vendor-backfill-pass3";
const MIG = "202611141200_backfill_bills_mdata_vendor_id_pass3.sql";
const MATCH = /backfill_bills_mdata_vendor_id_pass3\.sql$/;

export function auditPass3(sql) {
  const problems = [];
  if (!/UPDATE\s+accounting\.bills\s+b/i.test(sql)) {
    problems.push(`${MIG}: must UPDATE accounting.bills`);
  }
  if (!/SET\s+mdata_vendor_id\s*=\s*v\.id/i.test(sql)) {
    problems.push(`${MIG}: must SET mdata_vendor_id from mdata.vendors.id`);
  }
  if (!/FROM\s+mdata\.vendors\s+v/i.test(sql)) {
    problems.push(`${MIG}: must join mdata.vendors`);
  }
  if (!/v\.qbo_vendor_id\s*=\s*b\.vendor_id/i.test(sql)) {
    problems.push(`${MIG}: must match on qbo_vendor_id = bills.vendor_id (QBO-id pass)`);
  }
  if (!/mdata_vendor_id\s+IS\s+NULL/i.test(sql)) {
    problems.push(`${MIG}: must guard with mdata_vendor_id IS NULL (idempotent — no relink)`);
  }
  if (!/v\.operating_company_id\s*=\s*b\.operating_company_id/i.test(sql)) {
    problems.push(`${MIG}: must join on operating_company_id (entity-scoped)`);
  }
  if (/vendor_id::uuid/i.test(sql)) {
    problems.push(`${MIG}: pass 3 must not cast vendor_id::uuid — QBO ids like "2244" abort mid-migration`);
  }
  return problems;
}

function auditTree() {
  const files = readdirSync(join(ROOT, DIR)).filter((f) => MATCH.test(f));
  if (files.length === 0) return [`${DIR}/${MIG} not found`];
  if (files.length > 1) return [`${DIR}: expected one pass3 migration, found ${files.length}`];
  return auditPass3(readFileSync(join(ROOT, DIR, files[0]), "utf8"));
}

function selftest() {
  const failures = [];
  const good = `UPDATE accounting.bills b SET mdata_vendor_id = v.id FROM mdata.vendors v WHERE v.qbo_vendor_id = b.vendor_id AND v.operating_company_id = b.operating_company_id AND b.mdata_vendor_id IS NULL;`;
  if (auditPass3(good).length !== 0) failures.push(`case1 FAIL — compliant pass3 SQL flagged: ${auditPass3(good).join(" | ")}`);
  const noIdem = `UPDATE accounting.bills b SET mdata_vendor_id = v.id FROM mdata.vendors v WHERE v.qbo_vendor_id = b.vendor_id AND v.operating_company_id = b.operating_company_id;`;
  if (!auditPass3(noIdem).some((p) => p.includes("IS NULL"))) failures.push("case2 FAIL — non-idempotent UPDATE not caught");
  const noScope = `UPDATE accounting.bills b SET mdata_vendor_id = v.id FROM mdata.vendors v WHERE v.qbo_vendor_id = b.vendor_id AND b.mdata_vendor_id IS NULL;`;
  if (!auditPass3(noScope).some((p) => p.includes("operating_company_id"))) failures.push("case3 FAIL — cross-entity UPDATE not caught");
  const badCast = `UPDATE accounting.bills b SET mdata_vendor_id = v.id FROM mdata.vendors v WHERE v.id = b.vendor_id::uuid AND b.mdata_vendor_id IS NULL AND v.operating_company_id = b.operating_company_id;`;
  if (!auditPass3(badCast).some((p) => p.includes("::uuid"))) failures.push("case4 FAIL — vendor_id::uuid cast not caught");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real migration flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — pass3 pattern enforced, idempotent + entity-scoped, no ::uuid cast`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — pass3 bills mdata_vendor_id backfill migration present and idempotent`);
}

main();
