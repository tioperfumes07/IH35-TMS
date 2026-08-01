#!/usr/bin/env node
/**
 * COMP-F72 — the carrier USDOT/MC seed must be NON-DESTRUCTIVE and idempotent.
 *
 * WHY: this migration writes a regulatory identifier onto the live operating carriers. If it ever
 * wrote unconditionally, a redeploy would silently stamp over a value the owner had corrected by
 * hand — and a wrong USDOT number on a DOT-regulated carrier is the kind of error an FMCSA reviewer
 * finds, not the kind CI does. Every UPDATE must therefore be guarded by `IS NULL`, so the migration
 * fills a blank exactly once and is a no-op forever after.
 *
 * It must also stay scoped by company CODE rather than a hardcoded UUID (repo rule: no hardcoded
 * UUIDs in migrations), and must never touch USMCA, which legitimately has no authority yet and
 * carries an explicit placeholder.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const LABEL = "verify-carrier-usdot-seed-nondestructive";
const MATCH = /seed_carrier_usdot_mc_numbers\.sql$/;

export function auditSeed(sql) {
  const problems = [];
  const updates = [...sql.matchAll(/UPDATE\s+org\.companies[\s\S]*?;/gi)].map((m) => m[0]);
  if (updates.length === 0) {
    problems.push(`${DIR}: the USDOT seed contains no UPDATE against org.companies.`);
    return problems;
  }
  for (const u of updates) {
    if (!/\bIS\s+NULL\b/i.test(u)) {
      problems.push(
        `${DIR}: an UPDATE on org.companies writes a regulatory identifier without an IS NULL guard. ` +
          `A redeploy would overwrite an owner-corrected USDOT/MC number.`
      );
    }
    if (!/\bcode\s*=\s*'/.test(u)) {
      problems.push(`${DIR}: an UPDATE is not scoped by company code (hardcoded UUIDs are banned in migrations).`);
    }
    if (/'USMCA'/.test(u)) {
      problems.push(`${DIR}: the seed touches USMCA, which has no authority yet and must keep its explicit placeholder.`);
    }
  }
  return problems;
}

function auditTree() {
  const files = readdirSync(join(ROOT, DIR)).filter((f) => MATCH.test(f));
  if (files.length === 0) return []; // not yet present / already superseded — nothing to assert
  return files.flatMap((f) => auditSeed(readFileSync(join(ROOT, DIR, f), "utf8")));
}

function selftest() {
  const failures = [];
  const unguarded = `UPDATE org.companies SET usdot_number = '2961978' WHERE code = 'TRANSP';`;
  if (!auditSeed(unguarded).some((p) => p.includes("without an IS NULL guard")))
    failures.push("case1 FAIL — an unguarded overwrite was NOT caught");
  const guarded = `UPDATE org.companies SET usdot_number = '2961978', updated_at = now() WHERE code = 'TRANSP' AND usdot_number IS NULL;`;
  if (auditSeed(guarded).length !== 0) failures.push(`case2 FAIL — the guarded seed was flagged: ${auditSeed(guarded).join(" | ")}`);
  const uuidScoped = `UPDATE org.companies SET usdot_number = '1' WHERE id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid AND usdot_number IS NULL;`;
  if (!auditSeed(uuidScoped).some((p) => p.includes("not scoped by company code")))
    failures.push("case3 FAIL — a hardcoded-UUID scope was NOT caught");
  const usmca = `UPDATE org.companies SET usdot_number = 'X', updated_at = now() WHERE code = 'USMCA' AND usdot_number IS NULL;`;
  if (!auditSeed(usmca).some((p) => p.includes("touches USMCA"))) failures.push("case4 FAIL — a USMCA write was NOT caught");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real migration flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — unguarded overwrite caught, guarded seed clean, uuid scope caught, USMCA write caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the carrier USDOT/MC seed is IS-NULL-guarded, code-scoped, and leaves USMCA alone`);
}

main();
