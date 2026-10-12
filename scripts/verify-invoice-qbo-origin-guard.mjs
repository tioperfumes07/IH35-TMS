#!/usr/bin/env node
/** Legacy-named wrapper; invoice GL eligibility is native-document based, not QBO-origin based. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeNativeDocumentGl, runNativeDocumentGlSelftest } from "./lib/native-document-gl-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");
if (process.argv.includes("--selftest")) {
  const results = runNativeDocumentGlSelftest(fs.readFileSync(file, "utf8"));
  const failed = results.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-invoice-qbo-origin-guard --selftest: FAIL", failed);
    process.exit(1);
  }
  console.log("verify-invoice-qbo-origin-guard --selftest: PASS");
  process.exit(0);
}
const failures = analyzeNativeDocumentGl(fs.readFileSync(file, "utf8"));
if (failures.length) {
  console.error("verify-invoice-qbo-origin-guard: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-invoice-qbo-origin-guard: PASS (invoice and related native document builders retain non-origin eligibility controls)");
