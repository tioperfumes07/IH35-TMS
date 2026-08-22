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
const API = "apps/frontend/src/api/banking.ts";
const PLAID = "apps/backend/src/integrations/plaid/link.routes.ts";
const TRANSFERS = "apps/frontend/src/pages/banking/TransfersListPage.tsx";
const PLAID_PANEL = "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx";
const ACCOUNT_DETAIL = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";
const RECON_WORKSPACE = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";
const LINKED_PANEL = "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx";
const CATEGORIZATION_ROUTES = "apps/backend/src/banking/categorization.routes.ts";
const MATRIX = "docs/specs/scoreboard/modules/banking.required.json";
const CLAIMED_LEAVES = ["transactions.list", "transactions.categorize"];

const CHECKS = [
  { name: "transactions route mounted", file: ROUTES, pattern: /path="\/banking\/transactions"[\s\S]{0,180}<BankingHomePage initialTab="transactions" \/>/ },
  { name: "transactions view mounted", file: HOME, pattern: /<BankingTransactionsDesignView[\s\S]{0,160}companyId=\{companyId\}/ },
  { name: "categorization reverse read company scoped", file: VIEW, pattern: /getBankTransactionCategorizationLinks\(String\(expandedTxId\), companyId\)/ },
  { name: "persisted linkage panel", file: VIEW, pattern: /data-testid="banking-tx-categorization-links-panel"/ },
  { name: "list driver drill", file: VIEW, pattern: /kind="driver"\s+id=\{tx\.categorization_driver_id\}[\s\S]{0,160}tx\.categorization_driver_name/ },
  { name: "list unit drill", file: VIEW, pattern: /kind="unit"\s+id=\{tx\.categorization_unit_id\}[\s\S]{0,160}tx\.categorization_unit_number/ },
  { name: "list load drill", file: VIEW, pattern: /kind="load"\s+id=\{tx\.resolved_load_id\}/ },
  { name: "list settlement drill", file: VIEW, pattern: /kind="settlement"\s+id=\{tx\.matched_settlement_id\}/ },
  { name: "list bill drill", file: VIEW, pattern: /kind="bill"\s+id=\{tx\.matched_bill_id\}/ },
  { name: "list linkage strip visible for every matched kind", file: VIEW, pattern: /tx\.categorization_load_id \|\|\s+hasPersistedMatch\(tx\) \|\|\s+tx\.categorization_trailer_id/ },
  { name: "list journal entry drill", file: VIEW, pattern: /kind="journal_entry"\s+id=\{tx\.matched_journal_entry_id\}/ },
  { name: "transaction view all-kind match classifier", file: VIEW, pattern: /function hasPersistedMatch\(tx: PlaidBankTransaction\)[\s\S]{0,120}tx\.is_matched[\s\S]{0,500}tx\.matched_expense_id[\s\S]{0,160}tx\.matched_transfer_id[\s\S]{0,160}tx\.matched_journal_entry_id/ },
  { name: "transaction review uses canonical classifier", file: VIEW, pattern: /const looksCategorized =\s+hasPersistedMatch\(tx\)/ },
  { name: "transaction uncategorized uses canonical classifier", file: VIEW, pattern: /return !tx\.matched_kind && !hasPersistedMatch\(tx\)/ },
  { name: "bank transaction transfer id contract", file: API, pattern: /matched_transfer_id\?: string \| null;[\s\S]{0,120}matched_transfer_label\?: string \| null;/ },
  { name: "per-account transfer reverse read", file: PLAID, pattern: /bt\.matched_transfer_id::text AS matched_transfer_id,[\s\S]{0,180}AS matched_transfer_label/ },
  { name: "per-account transfer matched kind", file: PLAID, pattern: /bt\.matched_transfer_id::text AS matched_transfer_id,[\s\S]{0,600}WHEN bt\.matched_transfer_id IS NOT NULL THEN 'transfer'[\s\S]{0,400}END AS matched_kind/ },
  { name: "company transfer reverse read", file: PLAID, pattern: /bt\.matched_transfer_id::text AS matched_transfer_id,[\s\S]{0,180}AS matched_transfer_label[\s\S]{0,1800}WHEN bt\.matched_transfer_id IS NOT NULL THEN 'transfer'/ },
  { name: "company matched load human read", file: PLAID, pattern: /bt\.matched_load_id,\s+matched_load\.load_number AS matched_load_number/ },
  { name: "matched load label join company scoped", file: PLAID, pattern: /LEFT JOIN mdata\.loads matched_load\s+ON matched_load\.id = bt\.matched_load_id\s+AND matched_load\.operating_company_id = bt\.operating_company_id/ },
  { name: "company resolved load pair", file: PLAID, pattern: /COALESCE\(bt\.categorization_load_id, bt\.matched_load_id\)::text AS resolved_load_id,\s+COALESCE\(l\.load_number, matched_load\.load_number\) AS resolved_load_number/ },
  { name: "transfer label join company scoped", file: PLAID, pattern: /LEFT JOIN banking\.transfers transfer\s+ON transfer\.id = bt\.matched_transfer_id\s+AND transfer\.operating_company_id = bt\.operating_company_id/g },
  { name: "list transfer drill", file: VIEW, pattern: /kind="transfer"\s+id=\{tx\.matched_transfer_id\}[\s\S]{0,160}tx\.matched_transfer_label/ },
  { name: "transfer exact deep link read", file: TRANSFERS, pattern: /const deepLinkTransferId = searchParams\.get\("transfer_id"\)[\s\S]{0,5000}getTransfer\(deepLinkTransferId, companyId\)/ },
  { name: "transfer readers resolve scoped JE labels", file: "apps/backend/src/banking/transfers.service.ts", pattern: /je\.memo AS journal_entry_memo[\s\S]*LEFT JOIN accounting\.journal_entries je[\s\S]{0,180}je\.operating_company_id = t\.operating_company_id[\s\S]*je\.memo AS journal_entry_memo[\s\S]*LEFT JOIN accounting\.journal_entries je[\s\S]{0,180}je\.operating_company_id = t\.operating_company_id/ },
  { name: "transfer detail JE reverse drill", file: TRANSFERS, pattern: /detail\.transfer\.journal_entry_id \? \([\s\S]{0,180}kind="journal_entry"[\s\S]{0,180}detail\.transfer\.journal_entry_memo/ },
  { name: "transfer detail bank transaction reverse drill", file: TRANSFERS, pattern: /detail\.transfer\.matched_bank_transaction_id \? \([\s\S]{0,180}kind="bank_transaction"[\s\S]{0,220}detail\.transfer\.matched_bank_transaction_label/ },
  { name: "Plaid connections transfer drill", file: PLAID_PANEL, pattern: /t\.matched_transfer_id \? <EntityLink key="transfer" kind="transfer"[\s\S]{0,180}t\.matched_transfer_label/ },
  { name: "company expense reverse read", file: PLAID, pattern: /bt\.matched_expense_id::text AS matched_expense_id,[\s\S]{0,100}expense\.expense_number AS matched_expense_number/ },
  { name: "both transaction readers expose multi-match contract", file: PLAID, pattern: /ARRAY_REMOVE\(ARRAY\[[\s\S]{0,500}AS matched_kinds[\s\S]*ARRAY_REMOVE\(ARRAY\[[\s\S]{0,500}AS matched_kinds/ },
  { name: "both transaction readers expose canonical matched truth", file: PLAID, pattern: /matched_journal_entry_id IS NOT NULL\) AS is_matched[\s\S]*matched_journal_entry_id IS NOT NULL\) AS is_matched/ },
  { name: "Plaid connections journal entry drill", file: PLAID_PANEL, pattern: /t\.matched_journal_entry_id \? <EntityLink key="je" kind="journal_entry"[\s\S]{0,180}t\.matched_journal_entry_memo/ },
  { name: "Plaid connections expense drill", file: PLAID_PANEL, pattern: /t\.matched_expense_id \? <EntityLink key="expense" kind="expense"[\s\S]{0,180}t\.matched_expense_number/ },
  { name: "Plaid connections renders concurrent matches", file: PLAID_PANEL, pattern: /const links = \[[\s\S]{0,1200}t\.matched_journal_entry_id[\s\S]{0,800}t\.matched_expense_id[\s\S]{0,1000}links\.length/ },
  { name: "register matched expense drill", file: VIEW, pattern: /kind="expense"\s+id=\{tx\.matched_expense_id\}[\s\S]{0,160}tx\.matched_expense_number/ },
  { name: "Plaid connections matched load label", file: PLAID_PANEL, pattern: /t\.matched_load_id \? <EntityLink key="load" kind="load"[\s\S]{0,180}t\.matched_load_number/ },
  { name: "register linked load drills use resolved pair", file: VIEW, pattern: /kind="load"\s+id=\{tx\.resolved_load_id\}\s+label=\{entityLabel\(tx\.resolved_load_number, tx\.resolved_load_id, "Load"\)\}[\s\S]{0,7000}kind="load"\s+id=\{tx\.resolved_load_id\}\s+label=\{entityLabel\(tx\.resolved_load_number, tx\.resolved_load_id, "Load"\)\}/ },
  { name: "bank account register transfer drill", file: ACCOUNT_DETAIL, pattern: /row\.matched_transfer_id \? <EntityLink key="transfer" kind="transfer"[\s\S]{0,180}row\.matched_transfer_label/ },
  { name: "per-account expense reverse read", file: PLAID, pattern: /bt\.matched_expense_id::text AS matched_expense_id,[\s\S]{0,100}expense\.expense_number AS matched_expense_number/ },
  { name: "expense label join company scoped", file: PLAID, pattern: /LEFT JOIN accounting\.expenses expense\s+ON expense\.id = bt\.matched_expense_id\s+AND expense\.operating_company_id = bt\.operating_company_id/ },
  { name: "bank account register expense drill", file: ACCOUNT_DETAIL, pattern: /row\.matched_expense_id \? <EntityLink key="expense" kind="expense"[\s\S]{0,180}row\.matched_expense_number/ },
  { name: "bank account register journal entry drill", file: ACCOUNT_DETAIL, pattern: /row\.matched_journal_entry_id \? <EntityLink key="je" kind="journal_entry"[\s\S]{0,180}row\.matched_journal_entry_memo/ },
  { name: "bank account register renders concurrent matches", file: ACCOUNT_DETAIL, pattern: /function matchedTransactionLinks[\s\S]{0,1600}row\.matched_expense_id[\s\S]{0,800}row\.matched_journal_entry_id[\s\S]{0,800}links\.length/ },
  { name: "reconciliation classifies every persisted match", file: RECON_WORKSPACE, pattern: /function transactionIsMatched\(tx: PlaidBankTransaction\)[\s\S]{0,120}tx\.is_matched[\s\S]{0,500}tx\.matched_transfer_id[\s\S]{0,160}tx\.matched_journal_entry_id/ },
  { name: "reconciliation uses canonical match classifier", file: RECON_WORKSPACE, pattern: /transactionIsMatched\(tx\)[\s\S]*transactionIsMatched\(tx\)[\s\S]*transactionIsMatched\(tx\)[\s\S]*transactionIsMatched\(tx\)/ },
  { name: "reconciliation transfer reverse drill", file: RECON_WORKSPACE, pattern: /kind="transfer" id=\{tx\.matched_transfer_id\}[\s\S]{0,180}tx\.matched_transfer_label/ },
  { name: "reconciliation journal entry reverse drill", file: RECON_WORKSPACE, pattern: /kind="journal_entry" id=\{tx\.matched_journal_entry_id\}[\s\S]{0,180}tx\.matched_journal_entry_memo/ },
  { name: "linked panel deduction human label projection", file: CATEGORIZATION_ROUTES, pattern: /COALESCE\(NULLIF\(TRIM\(ded\.deduction_type\), ''\), 'Driver deduction'\) AS deduction_label/ },
  { name: "linked panel deduction label join is company scoped", file: CATEGORIZATION_ROUTES, pattern: /LEFT JOIN driver_finance\.driver_settlement_deductions ded[\s\S]{0,180}ded\.operating_company_id = bt\.operating_company_id/ },
  { name: "linked panel deduction exact reverse drill", file: LINKED_PANEL, pattern: /row\.deduction_id \? \([\s\S]{0,300}kind="settlement_deduction"[\s\S]{0,120}id=\{row\.deduction_id\}[\s\S]{0,300}row\.deduction_label/ },
  { name: "company account join explicitly scoped", file: PLAID, pattern: /JOIN banking\.bank_accounts ba\s+ON ba\.id = bt\.bank_account_id\s+AND ba\.operating_company_id = bt\.operating_company_id/ },
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
