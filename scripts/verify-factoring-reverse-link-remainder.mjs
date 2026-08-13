#!/usr/bin/env node
/**
 * Factoring reverse_link remainder — Built for surfaces with EntityLink F+R.
 * Create/confirm/autocomplete chrome honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leafRe":"^(batches\\.create|factors\\.admin|faro\\.import|accounting\\.(list|detail|factor_recon)|banking\\.entry|factoring\\.wizard\\.batch)$","task":"VERTICAL-REVERSE-LINK-factoring-remainder","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-factoring-reverse-link-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-reverse-link-remainder";

const CHECKS = [
  { name: "BatchWizard EntityLink", file: "apps/frontend/src/pages/factoring/BatchWizard.tsx", pattern: /EntityLink/ },
  { name: "FactorAdmin EntityLink", file: "apps/frontend/src/pages/factoring/FactorAdmin.tsx", pattern: /EntityLink/ },
  { name: "FaroImportPage EntityLink", file: "apps/frontend/src/pages/factoring/FaroImportPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringListPage EntityLink", file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringDetailPage EntityLink", file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx", pattern: /EntityLink/ },
  { name: "FactorReconciliationPage EntityLink", file: "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx", pattern: /EntityLink/ },
  { name: "BankingHome factoring_advance EntityLink", file: "apps/frontend/src/pages/banking/BankingHome.tsx", pattern: /kind="factoring_advance"/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: pattern miss`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".factoring-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — factoring reverse_link remainder ratcheted`);
