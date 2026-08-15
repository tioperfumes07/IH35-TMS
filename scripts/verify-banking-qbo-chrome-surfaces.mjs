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
 * @matrix-built {"modules":["banking"],"cols":["connectivity"],"leafRe":"^banking\\.(modal|parity)\\.(record_ccpayment|record_transfer|transfer|manual_je)$","task":"PROTECTED-BANKING-CONNECTIVITY-MODALS","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["connectivity"],"leafRe":"^banking\\.(drawer|parity)\\.match$","task":"PROTECTED-BANKING-CONNECTIVITY-MATCH","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["connectivity"],"leafRe":"^banking\\.modal\\.manage_accounts$","task":"PROTECTED-BANKING-CONNECTIVITY-MANAGE","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["connectivity"],"leafRe":"^banking\\.panel\\.(banking_plaid_connections|plaid_sync_status)$","task":"PROTECTED-BANKING-CONNECTIVITY-PLAID","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["connectivity"],"leafRe":"^banking\\.panel\\.linked_bank_transactions$","task":"PROTECTED-BANKING-CONNECTIVITY-LINKED","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^statement_import$","task":"VERTICAL-QBO-CHROME-banking-statement-import","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^plaid$","task":"VERTICAL-QBO-CHROME-banking-plaid","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^settings$","task":"VERTICAL-QBO-CHROME-banking-settings","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^banking\\.modal\\.manage_accounts$","task":"VERTICAL-QBO-CHROME-banking-manage-accounts","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^banking\\.panel\\.(banking_plaid_connections|plaid_sync_status)$","task":"VERTICAL-QBO-CHROME-banking-plaid-panels","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^banking\\.panel\\.linked_bank_transactions$","task":"VERTICAL-QBO-CHROME-banking-linked-tx","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-banking-toolbar-filter","vertical":"column-wave"}
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
  {
    name: "BankingHome mounts manage/transfer/cc/manual JE connectivity chrome",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    pattern: /ManageAccountsModal[\s\S]*ManualJEModal[\s\S]*TransferModal[\s\S]*RecordCCPaymentModal/,
  },
  {
    name: "BankingHome mounts Plaid panels",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    pattern: /BankingPlaidConnectionsPanel[\s\S]*PlaidSyncStatusPanel|PlaidSyncStatusPanel[\s\S]*BankingPlaidConnectionsPanel/,
  },
  {
    name: "Transactions design view mounts MatchDrawer + RecordTransferModal",
    file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    pattern: /<MatchDrawer[\s\S]*<RecordTransferModal|<RecordTransferModal[\s\S]*<MatchDrawer/,
  },
  {
    name: "LinkedBankTransactionsPanel is mounted on VendorDetail (connectivity leaf)",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /LinkedBankTransactionsPanel/,
  },
  {
    name: "statement_import: BankingHome StatementUpload + honesty banner",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    pattern:
      /activeTab === "statement_import"[\s\S]*data-testid="banking-statement-import-not-recon-proof-banner"[\s\S]*StatementUpload/,
  },
  {
    name: "plaid: BankingHome mounts BankingPlaidConnectionsPanel + PlaidSyncStatusPanel",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    pattern:
      /activeTab === "plaid_connections"[\s\S]*BankingPlaidConnectionsPanel[\s\S]*PlaidSyncStatusPanel/,
  },
  {
    name: "plaid panel: ParityTable on BankingPlaidConnectionsPanel",
    file: "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx",
    pattern: /ParityTable[\s\S]*PlaidBankTransaction/,
  },
  {
    name: "settings: BankingHome settings honesty banner + ActionButton nav",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    pattern:
      /activeTab === "settings"[\s\S]*data-testid="banking-settings-not-ops-complete-banner"[\s\S]*ActionButton[\s\S]*Cash GL setup/,
  },
  {
    name: "manage_accounts: ManageAccountsModal Modal shell",
    file: "apps/frontend/src/pages/banking/components/ManageAccountsModal.tsx",
    pattern: /<Modal[\s\S]*title="Manage Accounts"[\s\S]*modalKind="banking-manage-accounts"/,
  },
  {
    name: "plaid_sync_status: PlaidSyncStatusPanel test id",
    file: "apps/frontend/src/components/banking/PlaidSyncStatusPanel.tsx",
    pattern: /data-testid="plaid-sync-status-panel"/,
  },
  {
    name: "linked_bank_transactions: EntityLink bank_transaction + journal_entry reverse",
    file: "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx",
    pattern: /kind="bank_transaction"[\s\S]*kind="journal_entry"/,
  },
  {
    name: "chrome.toolbar_filter: TransfersListPage CollapsedListFilters Apply triad + ParityTable",
    file: "apps/frontend/src/pages/banking/TransfersListPage.tsx",
    pattern:
      /CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}[\s\S]*ParityTable/,
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
