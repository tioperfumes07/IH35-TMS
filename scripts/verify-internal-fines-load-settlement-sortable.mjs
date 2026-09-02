#!/usr/bin/env node
/**
 * GUARD-WORKORDERS.md (line ~8451): Internal Fines' Load/Settlement columns were the one
 * un-remediated instance of the systemic "column has a custom render() but no sortable" defect
 * (the batch regression this same row references as already fixed elsewhere). Static, no-DB.
 *
 * Self-test: node scripts/verify-internal-fines-load-settlement-sortable.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-internal-fines-load-settlement-sortable";
const FILE = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";

const CHECKS = [
  {
    name: "Load column declares sortable + sortValue",
    pattern: /key: "related_load_id",\s*label: "Load",\s*sortable: true,\s*sortValue:/,
  },
  {
    name: "Settlement column declares sortable + sortValue",
    pattern: /key: "applied_to_settlement_id",\s*label: "Settlement",\s*sortable: true,[\s\S]{0,300}sortValue:/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  const src = readFile(FILE);
  if (src === null) {
    failures.push(`${FILE} not found`);
    return failures;
  }
  for (const c of CHECKS) {
    if (!c.pattern.test(src)) failures.push(`${c.name}: no longer matches expected shape`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
    key: "related_load_id",
      label: "Load",
      sortable: true,
      sortValue: (row) => row.x,
    key: "applied_to_settlement_id",
      label: "Settlement",
      sortable: true,
      sortValue: (row) => row.y,
  `;
  const goodFailures = checkAll(() => GOOD);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — Internal Fines Load/Settlement columns stay sortable`);
