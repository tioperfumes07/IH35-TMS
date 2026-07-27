#!/usr/bin/env node
/**
 * ND-INV-01: book-load imports from-load → lucia adapter needs luciaPool at module load.
 * driver-bills.test must partial-mock auth/db with luciaPool or vitest fails closed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/backend/src/driver-finance/__tests__/driver-bills.test.ts";
const LABEL = "verify-driver-bills-auth-db-mock-exports-lucia-pool";

function assertSource(src) {
  const problems = [];
  if (!/vi\.mock\(\s*["']\.\.\/\.\.\/auth\/db\.js["']/.test(src)) {
    problems.push(`${REL}: must mock ../../auth/db.js`);
  }
  if (!/luciaPool\s*:/.test(src)) {
    problems.push(`${REL}: auth/db mock must export luciaPool (book-load → from-load → lucia adapter)`);
  }
  return problems;
}

function selftest() {
  const good = `vi.mock("../../auth/db.js", () => ({ withCurrentUser: vi.fn(), luciaPool: {} }));`;
  const bad = `vi.mock("../../auth/db.js", () => ({ withCurrentUser: vi.fn() }));`;
  const failures = [];
  if (assertSource(good).length) failures.push("good rejected");
  if (!assertSource(bad).some((p) => p.includes("luciaPool"))) failures.push("missing luciaPool not caught");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const abs = path.join(ROOT, REL);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL: missing ${REL}`);
  process.exit(1);
}
const problems = assertSource(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — driver-bills auth/db mock exports luciaPool`);
