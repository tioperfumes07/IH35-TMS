#!/usr/bin/env node
/**
 * Banking qbo_chrome — leaf-specific Built for surfaces that already use
 * QBO chrome (ParityDrawer / DatePicker / MoneyInput / ParityTable / CollapsedListFilters).
 * HONEST-BUILT-LAUNCH-LAW: no leafRe:".*" / word-blanket banking(\.|$); only asserted leaves.
 *
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^accounts$","task":"VERTICAL-QBO-CHROME-banking-accounts","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^transactions\\.categorize$","task":"VERTICAL-QBO-CHROME-banking-categorize","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^reconciliation$","task":"VERTICAL-QBO-CHROME-banking-recon","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^banking\\.(modal|parity)\\.(record_transfer|transfer|record_ccpayment|bank_transaction_split|manual_je)$","task":"VERTICAL-QBO-CHROME-banking-modals","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^banking\\.(drawer|parity)\\.match$","task":"VERTICAL-QBO-CHROME-banking-match","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-banking-qbo-chrome-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-qbo-chrome-surfaces";

const CHECKS = [
  {
    name: "BankingHome DatePicker range + MoneyInput",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    pattern: /DatePicker[\s\S]*DatePicker[\s\S]*MoneyInput/,
  },
  {
    name: "BankTxCategorizationPage DatePicker + MoneyInput filters",
    file: "apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx",
    pattern: /DatePicker[\s\S]*DatePicker[\s\S]*MoneyInput[\s\S]*MoneyInput/,
  },
  {
    name: "ReconciliationWorkspace DatePicker + MoneyInput",
    file: "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx",
    pattern: /DatePicker[\s\S]*DatePicker[\s\S]*MoneyInput/,
  },
  {
    name: "TransfersListPage CollapsedListFilters + DatePicker + ParityTable",
    file: "apps/frontend/src/pages/banking/TransfersListPage.tsx",
    pattern: /CollapsedListFilters[\s\S]*DatePicker[\s\S]*DatePicker[\s\S]*ParityTable/,
  },
  {
    name: "RecordTransferModal ParityDrawer + MoneyInput + DatePicker",
    file: "apps/frontend/src/pages/banking/RecordTransferModal.tsx",
    pattern: /ParityDrawer[\s\S]*MoneyInput[\s\S]*DatePicker/,
  },
  {
    name: "TransferModal ParityDrawer + MoneyInput + DatePicker",
    file: "apps/frontend/src/pages/banking/TransferModal.tsx",
    pattern: /ParityDrawer[\s\S]*MoneyInput[\s\S]*DatePicker/,
  },
  {
    name: "RecordCCPaymentModal ParityDrawer + DatePicker + MoneyInput",
    file: "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx",
    pattern: /ParityDrawer[\s\S]*DatePicker[\s\S]*MoneyInput/,
  },
  {
    name: "BankTransactionSplitModal ParityDrawer + MoneyInput",
    file: "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
    pattern: /ParityDrawer[\s\S]*MoneyInput/,
  },
  {
    name: "ManualJEModal ParityDrawer + MoneyInput + DatePicker",
    file: "apps/frontend/src/pages/banking/components/ManualJEModal.tsx",
    pattern: /ParityDrawer[\s\S]*MoneyInput[\s\S]*DatePicker/,
  },
  {
    name: "MatchDrawer ParityDrawer (no hand-rolled fixed aside)",
    file: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
    pattern: /import\s*\{\s*ParityDrawer\s*\}[\s\S]*<ParityDrawer\b/,
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
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".banking-qbo-chrome-selftest-"));
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
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} banking qbo_chrome leaf asserts`);
