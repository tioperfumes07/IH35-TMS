#!/usr/bin/env node
/** @matrix-built {"modules":["banking","accounting","cash-flow","factoring","form_425","home","system"],"cols":["bank"],"leafRe":"^(accounts|transactions\\.categorize|factoring|driver_escrow|reports|settings|banking\\.modal\\.manage_accounts|banking\\.modal\\.manual_je|banking\\.panel\\.banking_plaid_connections|banking\\.parity\\.manual_je|payment_methods_catalog\\.create|hop\\.banking|accounting\\.factor_recon|law\\.virtual_banks_excluded|jump\\.banking|hop\\.banking_recon)$","task":"LINK-F5190-BANK-COLUMN-HONESTY-FALSE-REQUIRED"} */
/**
 * LINK-F5190 — bank Required-column honesty audit, false-required batch. Two parallel Explore
 * investigations covered banking (21 leaves) and a mixed accounting/cash-flow/dispatch/
 * factoring/fleet/form_425/home/system 9-leaf batch. 16 of the 30 total bank leaves are
 * false-required, dropped here -- each verified against a real absence of any owning
 * banking.bank_transactions row in the relevant flow, not assumed from prose. See this
 * commit's honesty_audit['bank_2026_08_15'] entries in each required.json for full per-leaf
 * reasoning. Pure Required-flag corrections; the companion genuine-gap batch (11 leaves, 6
 * code fixes) ships in the same commit but is asserted by a separate guard
 * (verify-bank-required-honest-genuine.mjs) since it needs source-code checks this one
 * doesn't.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-required-honest-false-required";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  banking: "docs/specs/scoreboard/modules/banking.required.json",
  accounting: "docs/specs/scoreboard/modules/accounting.required.json",
  "cash-flow": "docs/specs/scoreboard/modules/cash-flow.required.json",
  factoring: "docs/specs/scoreboard/modules/factoring.required.json",
  form_425: "docs/specs/scoreboard/modules/form_425.required.json",
  home: "docs/specs/scoreboard/modules/home.required.json",
  system: "docs/specs/scoreboard/modules/system.required.json",
};

const DROPPED = [
  ["banking", "accounts"],
  ["banking", "transactions.categorize"],
  ["banking", "factoring"],
  ["banking", "driver_escrow"],
  ["banking", "reports"],
  ["banking", "settings"],
  ["banking", "banking.modal.manage_accounts"],
  ["banking", "banking.modal.manual_je"],
  ["banking", "banking.panel.banking_plaid_connections"],
  ["banking", "banking.parity.manual_je"],
  ["accounting", "payment_methods_catalog.create"],
  ["cash-flow", "hop.banking"],
  ["factoring", "accounting.factor_recon"],
  ["form_425", "law.virtual_banks_excluded"],
  ["home", "jump.banking"],
  ["system", "hop.banking_recon"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

export function assertBankFalseRequired(docs) {
  const problems = [];
  for (const [mod, id] of DROPPED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if ((leaf.required || []).includes("bank")) problems.push(`${mod}:${id} must not require bank`);
  }
  return problems;
}

function selftest() {
  const docs = {};
  for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);

  const goodProblems = assertBankFalseRequired(docs);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  for (const [mod, id] of DROPPED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "bank"])];
    if (assertBankFalseRequired(mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add bank to ${mod}:${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const liveDocs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) liveDocs[mod] = readJson(rel);
const failures = assertBankFalseRequired(liveDocs);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
