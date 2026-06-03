#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedFile = path.join(ROOT, "apps/backend/src/seed/csv-seed-import.ts");

const BULK_CLASSIFICATION_PATTERNS = [
  /quality_overall_flag\s*[:=]\s*['"]avoid['"]/,
  /quality_payment_score\s*[:=]/,
  /fmcsa_authority_status_at_verification\s*[:=]/,
  /tag_label\s*[:=]\s*['"]Late-pay['"]/,
  /tag_label\s*[:=]\s*['"]Medium['"]/,
  /INSERT\s+INTO\s+accounting\.customer_classifications/i,
  /INSERT\s+INTO\s+accounting\.vendor_classifications/i,
];

function fail(message) {
  console.error(`verify:no-bulk-default-classifications FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(seedFile)) {
  fail(`missing ${path.relative(ROOT, seedFile)}`);
}

const seed = fs.readFileSync(seedFile, "utf8");

if (!seed.includes("NEVER bulk-apply default classification tags")) {
  fail("csv-seed-import.ts must document the no-bulk-default-classifications safeguard");
}

for (const pattern of BULK_CLASSIFICATION_PATTERNS) {
  if (pattern.test(seed)) {
    fail(`seed file matches forbidden bulk classification pattern: ${pattern}`);
  }
}

console.log("verify:no-bulk-default-classifications PASS");
