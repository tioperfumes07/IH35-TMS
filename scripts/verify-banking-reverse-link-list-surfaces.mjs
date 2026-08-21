#!/usr/bin/env node
/**
 * Banking reverse_link — leaf-specific Built for surfaces with EntityLink drills.
 * Create-only modals honesty-dropped in required.json (same PR).
 *
 * @matrix-built {"modules":["banking"],"cols":["reverse_link"],"leafRe":"^transactions\\.(list|categorize)$","task":"VERTICAL-REVERSE-LINK-banking-lists","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-banking-reverse-link-list-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-reverse-link-list-surfaces";
const VIEW = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const ROUTES = "apps/frontend/src/routes/manifest.tsx";
const MATRIX = "docs/specs/scoreboard/modules/banking.required.json";
const CLAIMED_LEAVES = ["transactions.list", "transactions.categorize"];

const CHECKS = [
  { name: "transactions route mounted", file: ROUTES, pattern: /path="\/banking\/transactions"[\s\S]{0,180}<BankingHomePage initialTab="transactions" \/>/ },
  { name: "transactions view mounted", file: HOME, pattern: /<BankingTransactionsDesignView[\s\S]{0,160}companyId=\{companyId\}/ },
  { name: "categorization reverse read company scoped", file: VIEW, pattern: /getBankTransactionCategorizationLinks\(String\(expandedTxId\), companyId\)/ },
  { name: "persisted linkage panel", file: VIEW, pattern: /data-testid="banking-tx-categorization-links-panel"/ },
  { name: "list driver drill", file: VIEW, pattern: /kind="driver"\s+id=\{tx\.categorization_driver_id\}[\s\S]{0,160}tx\.categorization_driver_name/ },
  { name: "list unit drill", file: VIEW, pattern: /kind="unit"\s+id=\{tx\.categorization_unit_id\}[\s\S]{0,160}tx\.categorization_unit_number/ },
  { name: "list load drill", file: VIEW, pattern: /kind="load"\s+id=\{tx\.categorization_load_id \|\| tx\.matched_load_id\}/ },
  { name: "list settlement drill", file: VIEW, pattern: /kind="settlement"\s+id=\{tx\.matched_settlement_id\}/ },
  { name: "list bill drill", file: VIEW, pattern: /kind="bill"\s+id=\{tx\.matched_bill_id\}/ },
  { name: "list journal entry drill", file: VIEW, pattern: /kind="journal_entry"\s+id=\{tx\.matched_journal_entry_id\}/ },
  { name: "categorize driver drill", file: VIEW, pattern: /kind="driver" id=\{links\.driver_id\}[\s\S]{0,120}links\.driver_name/ },
  { name: "categorize unit drill", file: VIEW, pattern: /kind="unit" id=\{links\.unit_id\}[\s\S]{0,120}links\.unit_number/ },
  { name: "categorize load drill", file: VIEW, pattern: /kind="load" id=\{links\.load_id\}[\s\S]{0,120}links\.load_number/ },
  { name: "categorize vendor drill", file: VIEW, pattern: /kind="vendor" id=\{links\.vendor_id\}[\s\S]{0,120}links\.vendor_name/ },
  { name: "categorize customer drill", file: VIEW, pattern: /kind="customer" id=\{links\.customer_id\}[\s\S]{0,120}links\.customer_name/ },
];

function readSources() {
  return Object.fromEntries([...new Set([...CHECKS.map((check) => check.file), MATRIX])].map((file) => [
    file,
    fs.readFileSync(path.join(ROOT, file), "utf8"),
  ]));
}

function run(sources) {
  const fails = CHECKS.filter((check) => !check.pattern.test(sources[check.file])).map((check) => check.name);
  try {
    const matrix = JSON.parse(sources[MATRIX]);
    for (const id of CLAIMED_LEAVES) {
      const leaf = matrix.leaves?.find((item) => item.id === id);
      if (!leaf?.required?.includes("reverse_link")) fails.push(`exact Required ownership: ${id}:reverse_link`);
    }
  } catch {
    fails.push("banking Required matrix parses");
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  if (run(live).length) {
    console.error(`${LABEL} SELFTEST FAIL live:\n- ${run(live).join("\n- ")}`);
    process.exit(1);
  }
  for (const check of CHECKS) {
    const flags = check.pattern.flags.includes("g") ? check.pattern.flags : `${check.pattern.flags}g`;
    const plantedSource = live[check.file].replace(new RegExp(check.pattern.source, flags), "/* planted banking reverse defect */");
    if (plantedSource === live[check.file] || !run({ ...live, [check.file]: plantedSource }).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  for (const id of CLAIMED_LEAVES) {
    const plantedMatrix = live[MATRIX].replace(`"id": "${id}"`, `"id": "${id}.removed"`);
    if (plantedMatrix === live[MATRIX] || !run({ ...live, [MATRIX]: plantedMatrix }).includes(`exact Required ownership: ${id}:reverse_link`)) {
      console.error(`${LABEL} SELFTEST FAIL — exact leaf ownership stayed green: ${id}`);
      process.exit(1);
    }
  }
  const mutationCount = CHECKS.length + CLAIMED_LEAVES.length;
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount}/${mutationCount} planted defects rejected`);
  process.exit(0);
}

const fails = run(readSources());
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — banking reverse_link list surfaces ratcheted`);
