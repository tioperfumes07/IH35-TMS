#!/usr/bin/env node
/**
 * GUARD — Plaid category matching: leaf beats parent (step 3).
 * Self-test: node scripts/verify-plaid-leaf-beats-parent.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-plaid-leaf-beats-parent";
const MATCH = "apps/backend/src/integrations/plaid/plaid-category-match.ts";
const PLAID = "apps/backend/src/integrations/plaid/plaid.service.ts";
const ENGINE = "apps/backend/src/banking/banking-rules.engine.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(sources) {
  const problems = [];
  const { match, plaid, engine } = sources;

  if (!/pickBestCategoryRule/.test(match) || !/PLAID_PARENT_CATEGORY_TOKENS/.test(match)) {
    problems.push(`${MATCH}: must export pickBestCategoryRule + parent token set`);
  }
  if (!/exact/.test(match) || !/patternLen/.test(match) || !/isParent/.test(match)) {
    problems.push(`${MATCH}: specificity must consider exact, patternLen, isParent`);
  }
  if (!/pickBestCategoryRule/.test(plaid)) {
    problems.push(`${PLAID}: autoCategorize must use pickBestCategoryRule (not first .find match)`);
  }
  if (/rules\.find\([\s\S]{0,80}matchesRule/.test(plaid)) {
    problems.push(`${PLAID}: must not use rules.find(matchesRule) — that ignores leaf specificity`);
  }
  // Banking rules from step 2 still precede Plaid
  if (!/autoCategorizeFromBankingRules/.test(plaid) || !/autoCategorizeFromBankingRules/.test(engine)) {
    problems.push("banking_rules must still win before Plaid (autoCategorizeFromBankingRules)");
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { match: read(MATCH), plaid: read(PLAID), engine: read(ENGINE) };
  const broken = {
    match: "export function matchesRule() { return true }",
    plaid: "const matched = rules.find((rule) => matchesRule(rule.plaid_category_pattern, categories))",
    engine: "",
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken not flagged`);
    process.exit(1);
  }
  if (collectProblems(real).length > 0) {
    console.error(`${LABEL} --selftest FAIL: real flagged`, collectProblems(real));
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems({ match: read(MATCH), plaid: read(PLAID), engine: read(ENGINE) });
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}
