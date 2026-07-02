#!/usr/bin/env node
// verify-safety-settings-trigger-secdef.mjs — regression lock for the safety_settings provisioning bug.
//
// safety.ensure_company_safety_settings() is the AFTER-INSERT trigger on org.companies that provisions a
// safety.safety_settings row per new company. safety_settings has no INSERT RLS policy, so if this function
// runs as the caller (SECURITY INVOKER) while ih35_app creates a company (USMCA bootstrap / bootstrapCarrier),
// the INSERT is RLS-blocked and company creation 500s. It MUST stay SECURITY DEFINER so provisioning runs as
// the (privileged) function owner. This guard fails the build if the FINAL definition in the migration chain
// is not SECURITY DEFINER (e.g. a future CREATE OR REPLACE silently reverts it to INVOKER).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = path.join(ROOT, "db/migrations");
const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();

const FN = "safety.ensure_company_safety_settings";
// Match each CREATE OR REPLACE of the function and capture its body up to the terminating $$ ; block.
const defRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+safety\.ensure_company_safety_settings\s*\([\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi;

let finalIsDefiner = null; // null = never defined
let finalFile = null;

for (const f of files) {
  const src = fs.readFileSync(path.join(MIG, f), "utf8");
  const matches = src.match(defRe);
  if (!matches) continue;
  for (const def of matches) {
    finalIsDefiner = /SECURITY\s+DEFINER/i.test(def);
    finalFile = f;
  }
}

if (finalIsDefiner === null) {
  console.error("verify:safety-settings-trigger-secdef — FAILED");
  console.error(`  ✗ no CREATE OR REPLACE FUNCTION ${FN} found in db/migrations`);
  process.exit(1);
}
if (!finalIsDefiner) {
  console.error("verify:safety-settings-trigger-secdef — FAILED");
  console.error(`  ✗ the final definition of ${FN} (in ${finalFile}) is NOT SECURITY DEFINER — company`);
  console.error("    creation as ih35_app will RLS-block the safety_settings provisioning INSERT (500).");
  process.exit(1);
}

console.log(`[safety-settings-trigger-secdef] OK — ${FN} is SECURITY DEFINER (final def in ${finalFile}).`);
