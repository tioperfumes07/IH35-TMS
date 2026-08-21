#!/usr/bin/env node
/**
 * @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leafRe":"^accounting\\.detail$","task":"VERTICAL-REVERSE-LINK-factoring-remainder","vertical":"column-wave"}
 * Self-test: node scripts/verify-factoring-reverse-link-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-reverse-link-remainder";
const DETAIL = "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx";
const ROUTES = "apps/frontend/src/routes/manifest.tsx";
const MATRIX = "docs/specs/scoreboard/modules/factoring.required.json";
const CHECKS = [
  { name: "factoring detail route mounted", file: ROUTES, pattern: /path="\/accounting\/factoring\/:id"[\s\S]{0,180}<FactoringDetailPage \/>/ },
  { name: "invoice reverse drill", file: DETAIL, pattern: /kind="invoice" id=\{invoice\.id\}[\s\S]{0,100}invoice\.display_id/ },
  { name: "customer reverse drill", file: DETAIL, pattern: /kind="customer" id=\{invoice\.customer_id\}[\s\S]{0,120}invoice\.customer_name/ },
  { name: "reserve journal entry drill", file: DETAIL, pattern: /reserve_movements[\s\S]{0,900}kind="journal_entry"[\s\S]{0,100}id=\{row\.journal_entry_id\}/ },
  { name: "interest journal entry drill", file: DETAIL, pattern: /interest_accruals[\s\S]{0,900}kind="journal_entry"[\s\S]{0,100}id=\{row\.journal_entry_id\}/ },
];

function readSources() {
  return Object.fromEntries([DETAIL, ROUTES, MATRIX].map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));
}

function run(sources) {
  const failures = CHECKS.filter((check) => !check.pattern.test(sources[check.file])).map((check) => check.name);
  try {
    const matrix = JSON.parse(sources[MATRIX]);
    const leaf = matrix.leaves?.find((item) => item.id === "accounting.detail");
    if (!leaf?.required?.includes("reverse_link")) failures.push("exact Required ownership: accounting.detail:reverse_link");
  } catch {
    failures.push("factoring Required matrix parses");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  if (run(live).length) {
    console.error(`${LABEL} SELFTEST FAIL live:\n- ${run(live).join("\n- ")}`);
    process.exit(1);
  }
  for (const check of CHECKS) {
    const flags = check.pattern.flags.includes("g") ? check.pattern.flags : `${check.pattern.flags}g`;
    const planted = live[check.file].replace(new RegExp(check.pattern.source, flags), "/* planted factoring reverse defect */");
    if (planted === live[check.file] || !run({ ...live, [check.file]: planted }).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  const plantedMatrix = live[MATRIX].replace('"id": "accounting.detail"', '"id": "accounting.detail.removed"');
  if (plantedMatrix === live[MATRIX] || !run({ ...live, [MATRIX]: plantedMatrix }).includes("exact Required ownership: accounting.detail:reverse_link")) {
    console.error(`${LABEL} SELFTEST FAIL — exact leaf ownership stayed green`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6/6 planted defects rejected`);
  process.exit(0);
}

const failures = run(readSources());
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — factoring accounting.detail reverse_link ratcheted`);
