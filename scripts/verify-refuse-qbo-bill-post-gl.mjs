#!/usr/bin/env node
/** Legacy-named wrapper; native bills post to native GL regardless of QBO metadata. */
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
    console.error("verify-refuse-qbo-bill-post-gl --selftest: FAIL", failed);
    process.exit(1);
  }
  console.log("verify-refuse-qbo-bill-post-gl --selftest: PASS");
  process.exit(0);
}
const failures = analyzeNativeDocumentGl(fs.readFileSync(file, "utf8"));
if (failures.length) {
  console.error("verify-refuse-qbo-bill-post-gl: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-refuse-qbo-bill-post-gl: PASS (native bill GL is independent of QBO metadata; bill eligibility and payment sequencing retained)");
