#!/usr/bin/env node
/**
 * Secondary-module reverse_link Built for EntityLink surfaces.
 *
 * @matrix-built {"modules":["home"],"cols":["reverse_link"],"leafRe":"^hub\\.driver_reporting$","task":"VERTICAL-REVERSE-LINK-secondary-home","vertical":"column-wave"}
 * @matrix-built {"modules":["compliance"],"cols":["reverse_link"],"leafRe":"^(property_tax\\.(list|detail)|form2290|fleet\\.hos_board|tab\\.hos_tracker)$","task":"VERTICAL-REVERSE-LINK-secondary-compliance","vertical":"column-wave"}
 * @matrix-built {"modules":["finance"],"cols":["reverse_link"],"leafRe":"^nav\\.ar_ap_aging$","task":"VERTICAL-REVERSE-LINK-secondary-finance","vertical":"column-wave"}
 * @matrix-built {"modules":["program"],"cols":["reverse_link"],"leafRe":"^(legacy\\.board|program\\.parity\\.legacy_audit_scoreboard_page)$","task":"VERTICAL-REVERSE-LINK-secondary-program","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-secondary-reverse-link-batch.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-secondary-reverse-link-batch";

const CHECKS = [
  { name: "DriverHubReportingPage", file: "apps/frontend/src/pages/home/DriverHubReportingPage.tsx" },
  { name: "InventoryPartsStockPage", file: "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx" },
  { name: "InventoryAssignmentsPage", file: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx" },
  { name: "PropertyTaxRenditionPage", file: "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx" },
  { name: "Form2290Filings", file: "apps/frontend/src/pages/compliance/Form2290Filings.tsx" },
  { name: "FleetHosBoardSection", file: "apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx" },
  { name: "HosTrackerSection", file: "apps/frontend/src/pages/compliance/HosTrackerSection.tsx" },
  { name: "ArApAgingPage", file: "apps/frontend/src/pages/finance/ArApAgingPage.tsx" },
  { name: "DocsHomePage", file: "apps/frontend/src/pages/docs/DocsHomePage.tsx" },
  { name: "LegacyAuditScoreboardPage", file: "apps/frontend/src/pages/program/LegacyAuditScoreboardPage.tsx" },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    // home path may be Home/ vs home/
    const alt = abs.replace("/pages/home/", "/pages/Home/");
    const file = fs.existsSync(abs) ? abs : alt;
    if (!fs.existsSync(file)) { fails.push(`${c.name}: missing`); continue; }
    if (!/EntityLink/.test(fs.readFileSync(file, "utf8"))) fails.push(`${c.name}: no EntityLink`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".secondary-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) { console.error(`${LABEL} SELFTEST FAIL ${planted.length}`); process.exit(1); }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) { console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`); process.exit(1); }
  process.exit(0);
}

const fails = run();
if (fails.length) { console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — secondary reverse_link batch ratcheted`);
