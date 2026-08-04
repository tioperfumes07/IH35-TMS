#!/usr/bin/env node
/**
 * GUARD — verify-fuel-gl-no-double-post (REPLACES 2026-08-03 exit-0 stub)
 *
 * CLS-FUEL-DOUBLE-POST was a FALSE PREMISE (row 673). This file is NO LONGER a no-op.
 * It composes three real protections for the Fuel residual class:
 *
 *   1. leaf-can-never-be-captured-by-parent — Plaid leaf beats parent + banking_rules first
 *   2. re-categorization-always-reverses — undo path + reclass ops tool reverse JE first
 *   3. scope-matched Fuel GL tie-out — never Relay-subledger vs all-sources as "double-post"
 *
 * Self-test: node scripts/verify-fuel-gl-no-double-post.mjs --selftest
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-gl-no-double-post";

const CHILD_GUARDS = [
  "scripts/verify-plaid-leaf-beats-parent.mjs",
  "scripts/verify-banking-rules-merchant-condition.mjs",
  "scripts/verify-undo-categorization-reverses-je.mjs",
  "scripts/verify-fuel-miscategorization-reclass-tool.mjs",
  "scripts/verify-fuel-gl-scope-matched-tieout.mjs",
];

function runNode(script, args = []) {
  const res = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    encoding: "utf8",
    cwd: ROOT,
  });
  return {
    script,
    code: res.status ?? 1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

export function collectProblems(files) {
  const problems = [];
  for (const rel of CHILD_GUARDS) {
    if (!files[rel]) problems.push(`missing composed guard: ${rel}`);
  }
  const self = files["scripts/verify-fuel-gl-no-double-post.mjs"] ?? "";
  if (/Guard now exits 0|STATUS: SUPERSEDED \(2026-08-03\)\. CLS-FUEL-DOUBLE-POST was refuted/.test(self) &&
      !/leaf-can-never-be-captured-by-parent/.test(self)) {
    problems.push("verify-fuel-gl-no-double-post must not be the exit-0 stub");
  }
  if (!/leaf-can-never-be-captured-by-parent/.test(self)) {
    problems.push("must document leaf-can-never-be-captured-by-parent composition");
  }
  if (!/re-categorization-always-reverses/.test(self)) {
    problems.push("must document re-categorization-always-reverses composition");
  }
  if (!/scope-matched/.test(self)) {
    problems.push("must document scope-matched Fuel GL tie-out");
  }
  // Planted fixture: leaf must win over parent in match module
  const match = files["apps/backend/src/integrations/plaid/plaid-category-match.ts"] ?? "";
  if (!/pickBestCategoryRule/.test(match) || !/PLAID_PARENT_CATEGORY_TOKENS/.test(match)) {
    problems.push("plaid-category-match.ts must keep pickBestCategoryRule (leaf beats parent)");
  }
  const reclass = files["scripts/ops/reclass-fuel-miscategorized-bank-txns.ts"] ?? "";
  if (!/reverseJournalEntryNoFlip/.test(reclass) || !/maybePostBankCategorizationToGl/.test(reclass)) {
    problems.push("reclass ops tool must reverse then post via existing poster");
  }
  return problems;
}

function readTree() {
  const out = {};
  out["scripts/verify-fuel-gl-no-double-post.mjs"] = fs.readFileSync(
    path.join(ROOT, "scripts/verify-fuel-gl-no-double-post.mjs"),
    "utf8"
  );
  for (const rel of [
    ...CHILD_GUARDS,
    "apps/backend/src/integrations/plaid/plaid-category-match.ts",
    "scripts/ops/reclass-fuel-miscategorized-bank-txns.ts",
  ]) {
    const p = path.join(ROOT, rel);
    out[rel] = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }
  return out;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const broken = {
    "scripts/verify-fuel-gl-no-double-post.mjs":
      "STATUS: SUPERSEDED (2026-08-03). CLS-FUEL-DOUBLE-POST was refuted\nGuard now exits 0.\n",
    "apps/backend/src/integrations/plaid/plaid-category-match.ts": "",
    "scripts/ops/reclass-fuel-miscategorized-bank-txns.ts": "",
  };
  for (const g of CHILD_GUARDS) broken[g] = null;
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken not flagged`);
    process.exit(1);
  }
  const real = readTree();
  const realProblems = collectProblems(real);
  if (realProblems.length) {
    console.error(`${LABEL} --selftest FAIL: real flagged`, realProblems);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (IS_MAIN) {
  const staticProblems = collectProblems(readTree());
  if (staticProblems.length) {
    console.error(`${LABEL}: FAIL (static)`);
    for (const p of staticProblems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const failures = [];
  for (const g of CHILD_GUARDS) {
    const st = runNode(g, ["--selftest"]);
    if (st.code !== 0) {
      // undo guard uses --selftest differently; retry without if needed
      const plain = runNode(g, []);
      if (plain.code !== 0 && st.code !== 0) {
        failures.push(`${g} failed selftest/run: ${st.stderr || plain.stderr || st.stdout}`);
        continue;
      }
    }
    const run = runNode(g, []);
    if (run.code !== 0) {
      failures.push(`${g} FAIL: ${run.stderr || run.stdout}`);
    }
  }

  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    `${LABEL}: PASS (leaf-can-never-be-captured-by-parent + re-categorization-always-reverses + scope-matched tie-out)`
  );
}
