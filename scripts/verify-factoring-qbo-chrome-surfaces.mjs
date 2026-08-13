#!/usr/bin/env node
/**
 * Factoring qbo_chrome column — leaf-specific Built for surfaces that already use
 * QBO chrome (DatePicker / MoneyInput / ParityTable / ParityDrawer). Extends existing
 * factoring guards; NO new verify-step (Rule 37).
 *
 * @matrix-built {"modules":["factoring"],"cols":["qbo_chrome"],"leafRe":"^(home\\.(summary|statements_settings|faro_imports)|factors\\.admin)$","task":"VERTICAL-QBO-CHROME-factoring-home-admin","vertical":"column-wave"}
 * @matrix-built {"modules":["factoring"],"cols":["qbo_chrome"],"leafRe":"^(accounting\\.(list|submit|detail|factor_recon)|submit\\.queue)$","task":"VERTICAL-QBO-CHROME-factoring-accounting","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-factoring-qbo-chrome-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-qbo-chrome-surfaces";

const CHECKS = [
  {
    name: "FactoringHome DatePicker + MoneyInput + ParityTable",
    file: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    pattern: /DatePicker[\s\S]*MoneyInput[\s\S]*ParityTable|ParityTable[\s\S]*DatePicker[\s\S]*MoneyInput/,
  },
  {
    name: "FactorAdmin DatePicker",
    file: "apps/frontend/src/pages/factoring/FactorAdmin.tsx",
    pattern: /DatePicker/,
  },
  {
    name: "FaroImportPage DatePicker",
    file: "apps/frontend/src/pages/factoring/FaroImportPage.tsx",
    pattern: /DatePicker/,
  },
  {
    name: "SubmissionQueue submit path",
    file: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
    pattern: /submitMutation|createFactoringBatch|submit/,
  },
  {
    name: "FactoringListPage DatePicker + ParityTable",
    file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
    pattern: /DatePicker[\s\S]*ParityTable|ParityTable[\s\S]*DatePicker/,
  },
  {
    name: "FactoringDetailPage ParityDrawer + MoneyInput",
    file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    pattern: /ParityDrawer[\s\S]*MoneyInput|MoneyInput[\s\S]*ParityDrawer/,
  },
  {
    name: "FactorReconciliationPage ParityTable",
    file: "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx",
    pattern: /ParityTable/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".factoring-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
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

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — factoring qbo_chrome surfaces ratcheted`);
