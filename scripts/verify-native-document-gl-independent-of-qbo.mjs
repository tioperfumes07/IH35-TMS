#!/usr/bin/env node
/** Native invoice/payment documents post to the TMS book regardless of QBO mirror metadata. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeNativeDocumentGl, runNativeDocumentGlSelftest } from "./lib/native-document-gl-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");
const source = fs.readFileSync(file, "utf8");
if (process.argv.includes("--selftest")) {
  const results = runNativeDocumentGlSelftest(source);
  const failed = results.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-native-document-gl-independent-of-qbo --selftest: FAIL");
    for (const [name] of failed) console.error(`- ${name}`);
    process.exit(1);
  }
  console.log(`verify-native-document-gl-independent-of-qbo --selftest: PASS (${results.length} baseline/mutation checks)`);
  process.exit(0);
}
const failures = analyzeNativeDocumentGl(source);
if (failures.length) {
  console.error("verify-native-document-gl-independent-of-qbo: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-native-document-gl-independent-of-qbo: PASS (all 8 native builders, eligibility, period/balance/idempotency controls)");
