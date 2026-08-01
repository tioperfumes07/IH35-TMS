#!/usr/bin/env node
/**
 * ACCT-F73 — the bills vendor backfill must be idempotent, entity-scoped, and must never cast a
 * non-uuid string to uuid.
 *
 * WHY THE CAST CLAUSE IS THE POINT: the first draft filtered `vendor_id ~ '<uuid regex>'` and then
 * compared `v.id = b.vendor_id::uuid` as separate AND-ed predicates. SQL does NOT guarantee predicate
 * evaluation order, and simulating that shape read-only against prod aborted with
 *   invalid input syntax for type uuid: "2244"
 * — i.e. the migration would have FAILED on prod, mid-backfill, on a real QBO vendor id. A CASE
 * expression forces the shape test to run before the cast. Anyone "simplifying" the CASE back into a
 * plain regex-then-cast reintroduces a migration that dies partway through.
 *
 * The other invariants: every UPDATE writes only WHERE mdata_vendor_id IS NULL (so a redeploy is a
 * no-op and an already-linked bill is never relinked), and both passes join on
 * operating_company_id (a vendor from another entity must never be attached to a bill).
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const LABEL = "verify-bills-vendor-backfill-safe";
const MATCH = /backfill_bills_mdata_vendor_id\.sql$/;

export function auditBackfill(sql) {
  const problems = [];
  const updates = [...sql.matchAll(/UPDATE\s+accounting\.bills[\s\S]*?;/gi)].map((m) => m[0]);
  if (updates.length === 0) {
    problems.push(`${DIR}: the vendor backfill contains no UPDATE against accounting.bills.`);
    return problems;
  }
  for (const u of updates) {
    if (!/mdata_vendor_id\s+IS\s+NULL/i.test(u)) {
      problems.push(`${DIR}: an UPDATE is not guarded by 'mdata_vendor_id IS NULL' — it would relink already-linked bills on every redeploy.`);
    }
    if (!/operating_company_id\s*=\s*b\.operating_company_id/i.test(u)) {
      problems.push(`${DIR}: an UPDATE does not join on operating_company_id — a vendor from another entity could be attached to a bill.`);
    }
    // A ::uuid cast of the TEXT vendor_id is only safe inside a CASE that tests the shape first.
    if (/vendor_id::uuid/i.test(u) && !/CASE[\s\S]*?vendor_id::uuid/i.test(u)) {
      problems.push(
        `${DIR}: casts vendor_id::uuid outside a CASE. SQL does not guarantee predicate order, so a ` +
          `non-uuid QBO id (e.g. "2244") reaches the cast and ABORTS the migration mid-backfill — ` +
          `reproduced read-only against prod. Wrap the cast in CASE WHEN <uuid regex> THEN … END.`
      );
    }
  }
  return problems;
}

function auditTree() {
  const files = readdirSync(join(ROOT, DIR)).filter((f) => MATCH.test(f));
  if (files.length === 0) return [];
  return files.flatMap((f) => auditBackfill(readFileSync(join(ROOT, DIR, f), "utf8")));
}

function selftest() {
  const failures = [];
  const unsafeCast = `UPDATE accounting.bills b SET mdata_vendor_id = v.id FROM mdata.vendors v WHERE b.mdata_vendor_id IS NULL AND b.vendor_id ~* '^[0-9a-f-]+$' AND v.id = b.vendor_id::uuid AND v.operating_company_id = b.operating_company_id;`;
  if (!auditBackfill(unsafeCast).some((p) => p.includes("outside a CASE")))
    failures.push("case1 FAIL — a bare regex-then-cast was NOT caught");
  const safeCast = `UPDATE accounting.bills b SET mdata_vendor_id = v.id FROM mdata.vendors v WHERE b.mdata_vendor_id IS NULL AND v.id = (CASE WHEN b.vendor_id ~* '^[0-9a-f]{8}-' THEN b.vendor_id::uuid END) AND v.operating_company_id = b.operating_company_id;`;
  if (auditBackfill(safeCast).length !== 0) failures.push(`case2 FAIL — the CASE-guarded cast was flagged: ${auditBackfill(safeCast).join(" | ")}`);
  const noIdem = `UPDATE accounting.bills b SET mdata_vendor_id = v.id FROM mdata.vendors v WHERE v.qbo_vendor_id = b.vendor_id AND v.operating_company_id = b.operating_company_id;`;
  if (!auditBackfill(noIdem).some((p) => p.includes("IS NULL"))) failures.push("case3 FAIL — a non-idempotent UPDATE was NOT caught");
  const noScope = `UPDATE accounting.bills b SET mdata_vendor_id = v.id FROM mdata.vendors v WHERE b.mdata_vendor_id IS NULL AND v.qbo_vendor_id = b.vendor_id;`;
  if (!auditBackfill(noScope).some((p) => p.includes("operating_company_id"))) failures.push("case4 FAIL — a cross-entity UPDATE was NOT caught");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real migration flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — bare cast caught, CASE form clean, non-idempotent caught, cross-entity caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the bills vendor backfill is idempotent, entity-scoped, and casts only inside a CASE`);
}

main();
