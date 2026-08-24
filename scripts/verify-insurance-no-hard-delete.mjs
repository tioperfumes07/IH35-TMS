#!/usr/bin/env node
/** Preserves policy/claim/lawsuit evidence by forbidding hard DELETE writers. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src/insurance");
const PROTECTED = ["insurance.policy", "insurance.claim", "insurance.lawsuit", "insurance.claims", "insurance.lawsuits"];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

export function collectProblems(sources) {
  const problems = [];
  for (const [name, source] of Object.entries(sources)) {
    const flat = stripComments(source).replace(/\s+/g, " ");
    for (const table of PROTECTED) {
      const pattern = new RegExp(`DELETE\\s+FROM\\s+${table.replace(".", "\\.")}\\b`, "i");
      if (pattern.test(flat)) problems.push(`${name}:hard-delete:${table}`);
    }
  }
  return problems;
}

function readTree(dir, out = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readTree(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out[path.relative(ROOT, full)] = fs.readFileSync(full, "utf8");
  }
  return out;
}

function selftest() {
  for (const table of PROTECTED) {
    const expected = `planted:hard-delete:${table}`;
    if (!collectProblems({ planted: `DELETE FROM ${table} WHERE id = $1` }).includes(expected)) throw new Error(`selftest missed ${table}`);
  }
  if (collectProblems({ comment: "// DELETE FROM insurance.policy\nUPDATE insurance.policy SET status='cancelled'" }).length) throw new Error("selftest matched comment");
  if (collectProblems({ allowed: "UPDATE insurance.claim SET voided_at = now() WHERE id = $1" }).length) throw new Error("selftest rejected void/update");
  console.log(`verify-insurance-no-hard-delete --selftest ${PROTECTED.length + 2}/${PROTECTED.length + 2}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = collectProblems(readTree(SRC));
  if (failures.length) {
    console.error(`verify-insurance-no-hard-delete FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-insurance-no-hard-delete PASS — policy/claim/lawsuit evidence remains void-or-update only");
}
