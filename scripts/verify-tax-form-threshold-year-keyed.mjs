#!/usr/bin/env node
/**
 * Static guard for BLOCK-17/24 §8: no literal $600/$2,000 (or their cent equivalents 60000/200000)
 * dollar constant may exist in the tax-document application code path outside
 * catalogs.tax_form_thresholds seed data (the migration itself). The 2026 threshold change
 * ($600 -> $2,000, effective for payments on/after 2026-01-01) is exactly the kind of drift this
 * guard exists to prevent: the aggregation/route code must always look the number up from the
 * year-keyed table, never hardcode it.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CODE_FILES = [
  "apps/backend/src/tax-documents/box1-aggregation.service.ts",
  "apps/backend/src/tax-documents/tax-documents.routes.ts",
  "apps/backend/src/tax-documents/tax-document-pdf-renderer.ts",
];

let failed = 0;
function fail(msg) {
  console.error(`verify-tax-form-threshold-year-keyed: ${msg}`);
  failed = 1;
}

const FORBIDDEN_LITERALS = [/\b60000\b/, /\b200000\b(?!\s*ON)/, /\$\s*600\b/, /\$\s*2,?000\b/];

for (const rel of CODE_FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`expected file is missing: ${rel}`);
    continue;
  }
  const source = fs.readFileSync(p, "utf8");
  const codeLines = source.split("\n").filter((line) => !line.trim().startsWith("//"));
  for (const line of codeLines) {
    for (const re of FORBIDDEN_LITERALS) {
      if (re.test(line)) {
        fail(`${rel} contains a hardcoded threshold literal — must load via loadTaxFormThreshold()/catalogs.tax_form_thresholds instead:\n  ${line.trim()}`);
      }
    }
  }
  if (rel.includes("box1-aggregation") && !/loadTaxFormThreshold/.test(source)) {
    fail(`${rel} must expose/consume loadTaxFormThreshold() so the threshold is always year-keyed, never inline.`);
  }
}

if (failed) {
  console.error("verify-tax-form-threshold-year-keyed: FAILED");
  process.exit(1);
}
console.log("verify-tax-form-threshold-year-keyed: OK — no hardcoded 1099-NEC threshold literal found; catalogs.tax_form_thresholds is the only source.");
