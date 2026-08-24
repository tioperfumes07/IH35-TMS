#!/usr/bin/env node
/** Prevents reads of nonexistent insurance.policy_unit.is_active (42703/500). */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = "apps/backend/src/insurance";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

export function collectProblems(sources) {
  const problems = [];
  for (const [name, raw] of Object.entries(sources)) {
    const src = stripComments(raw);
    if (/\bpu\.is_active\b/i.test(src)) problems.push(`${name}:pu.is_active`);
    if (/\bpolicy_unit\.is_active\b/i.test(src)) problems.push(`${name}:policy_unit.is_active`);
    const directSelect = /SELECT[\s\S]{0,400}\bis_active\b[\s\S]{0,400}FROM\s+insurance\.policy_unit\b/i.test(src);
    const computed = /\(?\s*removed_at\s+IS\s+NULL\s*\)?\s+AS\s+is_active/i.test(src);
    if (directSelect && !computed) problems.push(`${name}:direct-is_active-select`);
  }
  return problems;
}

function readTree(dir, out = {}) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readTree(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out[full] = readFileSync(full, "utf8");
  }
  return out;
}

function selftest() {
  const cases = [
    ["pu alias", "SELECT pu.is_active FROM insurance.policy_unit pu", "pu.is_active"],
    ["table alias", "SELECT policy_unit.is_active FROM insurance.policy_unit", "policy_unit.is_active"],
    ["direct column", "SELECT id, is_active FROM insurance.policy_unit", "direct-is_active-select"],
  ];
  for (const [name, source, expected] of cases) {
    if (!collectProblems({ planted: source }).some((p) => p.endsWith(expected))) throw new Error(`selftest missed ${name}`);
  }
  const allowed = "SELECT (removed_at IS NULL) AS is_active FROM insurance.policy_unit";
  if (collectProblems({ allowed }).length) throw new Error("selftest rejected canonical removed_at projection");
  console.log("verify-insurance-policy-unit-columns --selftest 4/4");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = collectProblems(readTree(DIR));
  if (failures.length) {
    console.error(`verify-insurance-policy-unit-columns FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-insurance-policy-unit-columns PASS — policy-unit active state derives from removed_at; no nonexistent is_active reads");
}
