#!/usr/bin/env node
/**
 * BANK-F08 — Categorization Rules + automatch deep-wizard structural DoD.
 *
 * Asserts:
 *  - DOD-A: /banking/categorization-rules mounts CategorizationRulesPage (no ComingSoon twin)
 *  - DOD-B: editor fields (pattern, priority, coa) are controlled state AND included in create/update submit
 *  - VERIFY-3: API client hits /api/v1/banking/categorization-rules* (never RETIRE bank.*)
 *  - Automatch path: preview + applyHistorical + create/update wired on the same page
 *  - NEVER-DELETE: BankingHome keeps a Categorization rules entry point
 *
 * Does NOT flip scoreboard PASS — live TRANSP+USMCA browser remains UNVERIFIED (Rule 23).
 *
 *   node scripts/verify-bank-f08-categorization-rules-automatch.mjs
 *   node scripts/verify-bank-f08-categorization-rules-automatch.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-f08-categorization-rules-automatch";

const FILES = {
  manifest: "apps/frontend/src/routes/manifest.tsx",
  page: "apps/frontend/src/pages/banking/CategorizationRulesPage.tsx",
  home: "apps/frontend/src/pages/banking/BankingHome.tsx",
  api: "apps/frontend/src/api/banking.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,800}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];

  const block = routeBlock(src.manifest, "/banking/categorization-rules");
  if (!block) errors.push("DOD-A: missing route /banking/categorization-rules");
  else {
    if (/ComingSoonPage/.test(block)) {
      errors.push("DOD-A: categorization-rules must not mount ComingSoonPage");
    }
    if (!block.includes("<CategorizationRulesPage")) {
      errors.push("DOD-A: /banking/categorization-rules must render <CategorizationRulesPage />");
    }
  }

  if (!src.page.includes("export function CategorizationRulesPage")) {
    errors.push("DOD-A: CategorizationRulesPage export must remain live");
  }

  for (const needle of ["useState", "setPattern", "setPriority", "setCoaAccountId", "onSaveRule"]) {
    if (!src.page.includes(needle)) {
      errors.push(`DOD-B: CategorizationRulesPage must keep controlled editor wiring (${needle})`);
    }
  }

  // create + update must send the three editor fields (pattern / priority / coa)
  for (const fn of ["createCategorizationRule", "updateCategorizationRule"]) {
    if (!src.page.includes(fn)) {
      errors.push(`DOD-B: page must call ${fn}`);
    }
  }
  if (!/plaid_category_pattern:\s*nextPattern/.test(src.page)) {
    errors.push("DOD-B: submit payload must include plaid_category_pattern from editor state");
  }
  if (!/priority:\s*nextPriority/.test(src.page)) {
    errors.push("DOD-B: submit payload must include priority from editor state");
  }
  if (!/coa_account_id:\s*nextCoa/.test(src.page)) {
    errors.push("DOD-B: submit payload must include coa_account_id from editor state");
  }

  for (const needle of [
    "getCategorizationPreview",
    "applyCategorizationRuleHistorical",
    "deactivateCategorizationRule",
  ]) {
    if (!src.page.includes(needle)) {
      errors.push(`VERIFY-3 / automatch: page must wire ${needle}`);
    }
  }

  if (!src.home.includes("/banking/categorization-rules")) {
    errors.push("NEVER-DELETE: BankingHome must keep Categorization rules entry → /banking/categorization-rules");
  }

  if (/['`]bank\./.test(src.api) || /FROM\s+bank\./i.test(src.api)) {
    errors.push("VERIFY-3: apps/frontend/src/api/banking.ts must not reference RETIRE bank.*");
  }
  for (const needle of [
    "/api/v1/banking/categorization-rules",
    "getCategorizationRules",
    "createCategorizationRule",
    "applyCategorizationRuleHistorical",
    "getCategorizationPreview",
  ]) {
    if (!src.api.includes(needle)) {
      errors.push(`VERIFY-3: banking API client must expose ${needle}`);
    }
  }

  return errors;
}

function selftest() {
  const good = {
    manifest: 'path="/banking/categorization-rules"\n<CategorizationRulesPage />\n',
    page: [
      "export function CategorizationRulesPage",
      "useState",
      "setPattern",
      "setPriority",
      "setCoaAccountId",
      "onSaveRule",
      "createCategorizationRule",
      "updateCategorizationRule",
      "plaid_category_pattern: nextPattern",
      "priority: nextPriority",
      "coa_account_id: nextCoa",
      "getCategorizationPreview",
      "applyCategorizationRuleHistorical",
      "deactivateCategorizationRule",
    ].join("\n"),
    home: 'navigate("/banking/categorization-rules")',
    api: [
      "/api/v1/banking/categorization-rules",
      "getCategorizationRules",
      "createCategorizationRule",
      "applyCategorizationRuleHistorical",
      "getCategorizationPreview",
    ].join("\n"),
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const twin = { ...good, manifest: 'path="/banking/categorization-rules"\n<ComingSoonPage />\n' };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  const noSubmit = {
    ...good,
    page: good.page.replace("plaid_category_pattern: nextPattern", "plaid_category_pattern: 'x'"),
  };
  if (!contractErrors(noSubmit).some((e) => e.includes("plaid_category_pattern"))) {
    console.error(`${LABEL} --selftest FAIL submit parity miss not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — BANK-F08 Rules+automatch structural DoD; live browser TRANSP+USMCA still UNVERIFIED`
);
process.exit(0);
