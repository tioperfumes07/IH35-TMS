// FACT-FIX-1: Static guard — no 'TEST-VENDOR' fixture string literals in non-test production source.
// A TEST-VENDOR string in a migration or route means test data can reach prod.
// @example.com / m2-probe / m2-stop are covered separately in admin cleanup routes (allowed there).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const TEST_PATTERNS = [
  /['"`]TEST[-_ ]VENDOR/i,
];

const EXCLUDE_PATHS = [
  "node_modules",
  "__tests__",
  ".test.",
  ".spec.",
  "scripts/verify-no-test-fixture-names.mjs",
  "scripts/db-seed-test-fixtures.mjs",
  "dist",
  ".claude",
  // Legitimate archive/cleanup routes are allowed to reference these names
  "seed-cleanup",
  "archive-test-users",
];

function shouldExclude(filePath) {
  return EXCLUDE_PATHS.some((ex) => filePath.includes(ex));
}

let files;
try {
  const output = execSync(
    "git ls-files apps/backend/src apps/frontend/src db/migrations",
    { encoding: "utf8" }
  );
  files = output.trim().split("\n").filter(Boolean);
} catch {
  console.error("[verify-no-test-fixture-names] git ls-files failed");
  process.exit(1);
}

const violations = [];

for (const file of files) {
  if (shouldExclude(file)) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(content)) {
      violations.push({ file, pattern: pattern.source });
      break;
    }
  }
}

if (violations.length > 0) {
  console.error("[verify-no-test-fixture-names] FAIL — TEST-VENDOR fixture strings found in production source:");
  for (const v of violations) {
    console.error(`  ${v.file} (matched: ${v.pattern})`);
  }
  process.exit(1);
}

console.log(`[verify-no-test-fixture-names] PASS — ${files.length} files scanned, 0 TEST-VENDOR fixture strings in production source`);
