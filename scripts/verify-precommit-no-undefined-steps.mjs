#!/usr/bin/env node
/**
 * GUARD: verify-pre-commit.mjs must execute both structured default-export steps and
 * legacy module-scope scripts without importing a legacy process.exit() into the parent.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const FILE = resolve(ROOT, "scripts/verify-pre-commit.mjs");

function audit(src) {
  const problems = [];
  if (!src.includes(".filter(Boolean)")) problems.push("does not retain the undefined-export fail-closed filter");
  if (!src.includes("readFileSync(filePath")) problems.push("does not classify step source before import");
  if (!src.includes("/^\\s*export\\s+default\\b/m.test(source)")) problems.push("does not identify structured default exports");
  if (!src.includes('ctx.run("node", [path.relative(ROOT, filePath)])')) problems.push("does not isolate legacy scripts in child processes");
  return problems;
}

const src = readFileSync(FILE, "utf8");
const problems = audit(src);
if (problems.length) {
  console.error(`FAIL: ${problems.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    src.replace("readFileSync(filePath", "readFileSync(removedPath"),
    src.replace("/^\\s*export\\s+default\\b/m.test(source)", "false"),
    src.replace('ctx.run("node", [path.relative(ROOT, filePath)])', "undefined"),
  ];
  for (const mutation of mutations) {
    if (mutation === src || audit(mutation).length === 0) {
      console.error("FAIL: planted legacy-runner defect escaped");
      process.exit(1);
    }
  }
  console.log(`PASS: verify-precommit legacy isolation selftest ${mutations.length}/${mutations.length}`);
} else {
  console.log("PASS: verify-pre-commit runs structured and legacy steps without parent-process termination");
}
