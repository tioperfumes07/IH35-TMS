#!/usr/bin/env node
/**
 * F9-04/05 — bill_unit_allocation recompute must supersede, never DELETE-all.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-unit-allocation-recompute-atomic";
const SELFTEST = process.argv.includes("--selftest");

const FILES = [
  "apps/backend/src/accounting/bills.routes.ts",
  "apps/backend/src/maint/wo-ap-posting.service.ts",
];
const MIG = "db/migrations/202609100030_f9_04_bill_unit_allocation_supersede.sql";

/** @param {Record<string,string>} sources @param {string} mig */
export function check(sources, mig) {
  const problems = [];
  if (!mig) problems.push(`missing ${MIG}`);
  if (mig && !/superseded_at/.test(mig)) problems.push("migration must add superseded_at");
  if (mig && !/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must HOLD-FOR-JORGE");

  for (const [rel, src] of Object.entries(sources)) {
    if (!src) {
      problems.push(`missing ${rel}`);
      continue;
    }
    if (/DELETE\s+FROM\s+accounting\.bill_unit_allocation/i.test(src)) {
      problems.push(`${rel}: must not DELETE FROM accounting.bill_unit_allocation`);
    }
  }

  const bills = sources[FILES[0]] || "";
  const wo = sources[FILES[1]] || "";
  if (bills && !/superseded_at\s*=\s*now\(\)/.test(bills)) {
    problems.push("bills.routes allocate must supersede prior rows (superseded_at = now())");
  }
  if (wo && !/superseded_at\s*=\s*now\(\)/.test(wo)) {
    problems.push("wo-ap-posting must supersede prior rows (superseded_at = now())");
  }
  return problems;
}

function selftest() {
  const good = {
    [FILES[0]]: "UPDATE accounting.bill_unit_allocation SET superseded_at = now() WHERE superseded_at IS NULL",
    [FILES[1]]: "UPDATE accounting.bill_unit_allocation SET superseded_at = now() WHERE superseded_at IS NULL",
  };
  const bad = {
    [FILES[0]]: "DELETE FROM accounting.bill_unit_allocation WHERE bill_id = $1",
    [FILES[1]]: "DELETE FROM accounting.bill_unit_allocation WHERE bill_id = $1",
  };
  const goodMig = "HOLD-FOR-JORGE\nsuperseded_at";
  if (check(good, goodMig).length) throw new Error("compliant flagged");
  if (!check(bad, goodMig).length) throw new Error("DELETE not caught");
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const sources = Object.fromEntries(
  FILES.map((rel) => {
    const p = path.join(ROOT, rel);
    return [rel, fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""];
  })
);
const migPath = path.join(ROOT, MIG);
const mig = fs.existsSync(migPath) ? fs.readFileSync(migPath, "utf8") : "";
const problems = check(sources, mig);
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — bill_unit_allocation recompute supersedes (no DELETE)`);
