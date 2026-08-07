#!/usr/bin/env node
/**
 * SAF-DOM-02 — auto-fine trigger must read company_violation_drivers, not related_drivers jsonb.
 * Static: committed migration + held applied_on_prod. Live Neon proof is recorded in safety.json.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const MIG = "db/migrations/202609130000_saf_dom_02_company_violation_jsonb_archive.sql";
const HELD = "db/migrations/.held-migrations.json";

function assert() {
  const problems = [];
  const sql = readFileSync(path.join(ROOT, MIG), "utf8");
  const held = JSON.parse(readFileSync(path.join(ROOT, HELD), "utf8"));
  const basename = path.basename(MIG);
  const entry =
    (held.applied_held || []).find((e) => e.file === basename) ||
    (held.held || []).find((e) => e.file === basename);
  if (!entry) problems.push(`${HELD}: missing applied_held/held entry for ${basename}`);
  else if (entry.applied_on_prod !== true) {
    problems.push(`${HELD}: ${basename} must be applied_on_prod:true in applied_held after Neon apply`);
  } else if ((held.held || []).some((e) => e.file === basename)) {
    problems.push(`${HELD}: ${basename} must live in applied_held[], not held[]`);
  }
  // Extract the CREATE OR REPLACE FUNCTION body for auto_create_internal_fine_from_violation
  const m = sql.match(
    /CREATE OR REPLACE FUNCTION safety\.auto_create_internal_fine_from_violation\(\)[\s\S]*?\$func\$;/
  );
  if (!m) {
    problems.push(`${MIG}: missing CREATE OR REPLACE FUNCTION safety.auto_create_internal_fine_from_violation`);
  } else {
    const body = m[0];
    if (!/company_violation_drivers/.test(body)) {
      problems.push(`${MIG}: function body must SELECT from company_violation_drivers`);
    }
    // Ban NEW.related_drivers reads in the replacement body (comments may mention the word)
    if (/NEW\.related_drivers/.test(body)) {
      problems.push(`${MIG}: function body must not read NEW.related_drivers`);
    }
  }
  if (!/trg_reject_retired_cv_jsonb/.test(sql)) {
    problems.push(`${MIG}: must install trg_reject_retired_cv_jsonb archive trigger`);
  }
  return problems;
}

if (SELFTEST) {
  const live = assert();
  if (live.length) {
    console.error("SELFTEST setup unexpected:\n" + live.join("\n"));
    process.exit(1);
  }
  console.log("verify-saf-dom-02-autofine-reads-join-table SELFTEST PASS");
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error("verify-saf-dom-02-autofine-reads-join-table FAIL\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("verify-saf-dom-02-autofine-reads-join-table OK — migration reads join table; held applied_on_prod=true");
