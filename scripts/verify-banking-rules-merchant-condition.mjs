#!/usr/bin/env node
/**
 * GUARD — banking_rules merchant_contains + TRANSP seeds + Plaid precedence.
 *
 * FINDING: CLS-CATEGORY-MAP-COHERENCE / bank-rules step 2 — LOVE'S TIRE CARE and FUEL AMERICA
 * must be first-class merchant/description rules that stamp categorization BEFORE Plaid parents.
 *
 * Self-test: node scripts/verify-banking-rules-merchant-condition.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-rules-merchant-condition";
const MIGRATION = "db/migrations/202611300000_banking_rules_merchant_contains.sql";
const ENGINE = "apps/backend/src/banking/banking-rules.engine.ts";
const PLAID = "apps/backend/src/integrations/plaid/plaid.service.ts";
const ROUTES = "apps/backend/src/banking/p7-wave2.routes.ts";

const FUEL_UUID = "58c6e304-ab3e-4714-9c35-623ec51ae7cf";
const MAINT_UUID = "27c4a09a-0d34-4908-9da1-44b6174b5bce";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * @param {{ migration: string, engine: string, plaid: string, routes: string }} sources
 * @returns {string[]}
 */
export function collectProblems(sources) {
  const problems = [];
  const { migration, engine, plaid, routes } = sources;

  if (!/ADD COLUMN IF NOT EXISTS merchant_contains/i.test(migration)) {
    problems.push(`${MIGRATION}: must add merchant_contains column`);
  }
  if (!/seed:fuel-america-to-fuel/.test(migration) || !/FUEL AMERICA/.test(migration)) {
    problems.push(`${MIGRATION}: must seed FUEL AMERICA rule (rule_key seed:fuel-america-to-fuel)`);
  }
  if (!migration.includes(FUEL_UUID)) {
    problems.push(`${MIGRATION}: FUEL AMERICA seed must target Fuel UUID ${FUEL_UUID}`);
  }
  if (!/seed:loves-tire-care-to-maintenance/.test(migration) || !/TIRE CARE/.test(migration)) {
    problems.push(`${MIGRATION}: must seed LOVE'S TIRE CARE rule`);
  }
  if (!migration.includes(MAINT_UUID)) {
    problems.push(`${MIGRATION}: TIRE CARE seed must target Repair & Maintenance UUID ${MAINT_UUID}`);
  }

  if (!/merchant_contains/.test(engine) || !/normalizePayeeText/.test(engine)) {
    problems.push(`${ENGINE}: must match merchant_contains with normalizePayeeText`);
  }
  if (!/hasTextCondition|require/.test(engine) && !/merchant_contains\?\.trim\(\)/.test(engine)) {
    problems.push(`${ENGINE}: must require ≥1 text condition (no amount-only match-all)`);
  }
  if (!/autoCategorizeFromBankingRules/.test(engine)) {
    problems.push(`${ENGINE}: must export autoCategorizeFromBankingRules (CHAIN-05 stamp)`);
  }

  if (!/autoCategorizeFromBankingRules/.test(plaid)) {
    problems.push(`${PLAID}: sync path must call autoCategorizeFromBankingRules before Plaid autoCategorize`);
  }
  const ruleIdx = plaid.indexOf("autoCategorizeFromBankingRules");
  const plaidIdx = plaid.indexOf("await autoCategorize(", ruleIdx > 0 ? ruleIdx : 0);
  if (ruleIdx < 0 || plaidIdx < 0 || plaidIdx < ruleIdx) {
    problems.push(`${PLAID}: banking_rules categorization must precede autoCategorize (Plaid patterns)`);
  }

  if (!/merchant_contains:\s*z\.string\(\)/.test(routes)) {
    problems.push(`${ROUTES}: create rule API must accept merchant_contains`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = {
    migration: read(MIGRATION),
    engine: read(ENGINE),
    plaid: read(PLAID),
    routes: read(ROUTES),
  };
  const broken = {
    migration: "-- no seeds",
    engine: "export function bankingRuleMatches() { return true }",
    plaid: "await autoCategorize(row)",
    routes: "description_contains: z.string().optional()",
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken sources not flagged`);
    process.exit(1);
  }
  if (collectProblems(real).length > 0) {
    console.error(`${LABEL} --selftest FAIL: real sources flagged`, collectProblems(real));
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems({
    migration: read(MIGRATION),
    engine: read(ENGINE),
    plaid: read(PLAID),
    routes: read(ROUTES),
  });
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}
