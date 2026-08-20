#!/usr/bin/env node
/**
 * Legal qbo_chrome — leaf-specific Built for the 5 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(chrome|contracts|matters|policies|
 * templates)(\.|$)) — that guard verifies generic shared files (ReportsHome, RunnerFilters,
 * BillsPage, MaintenanceHome...) and never opens a legal file, same theater-coverage gap already
 * found and fixed for insurance (see verify-insurance-qbo-chrome-toolbar-filter.mjs and
 * verify-insurance-qbo-chrome-create-leaves.mjs, 2026-08-20).
 *
 * chrome.toolbar_(search|range|gear) are already real via verify-collapsed-list-filters-apply.mjs
 * (CLS-FILTER-GEAR-APPLY, includes legal). chrome.toolbar_filter's qbo_chrome column has no
 * leaf-specific guard for legal in any of the toolbar_filter guards (lists' own,
 * CODEX-ZERO-REMAINDER-PROTECTED-CHROME-7's 7-module list, banking's, settlements', insurance's) —
 * legal is in none of them.
 *
 * The features are already genuinely built: LegalMattersListPage/LegalTemplatesListPage use the real
 * CollapsedListFilters QBO chrome + ParityTable; UnifiedContractCreatorModal is a real ParityDrawer
 * with DatePicker/EntityPicker; LegalPoliciesPage is a real ParityTable; LegalMatterNewPage is a
 * page-based create (PageHeader chrome) whose shared LegalMatterFormFields uses real
 * DatePicker/MoneyInput/EntityPicker fields.
 *
 * @matrix-built {"modules":["legal"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-legal-toolbar-filter","vertical":"column-wave"}
 * @matrix-built {"modules":["legal"],"cols":["qbo_chrome"],"leafRe":"^contracts\\.create$","task":"VERTICAL-QBO-CHROME-legal-contracts-create","vertical":"column-wave"}
 * @matrix-built {"modules":["legal"],"cols":["qbo_chrome"],"leafRe":"^templates\\.list$","task":"VERTICAL-QBO-CHROME-legal-templates-list","vertical":"column-wave"}
 * @matrix-built {"modules":["legal"],"cols":["qbo_chrome"],"leafRe":"^policies$","task":"VERTICAL-QBO-CHROME-legal-policies","vertical":"column-wave"}
 * @matrix-built {"modules":["legal"],"cols":["qbo_chrome"],"leafRe":"^matters\\.create$","task":"VERTICAL-QBO-CHROME-legal-matters-create","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-legal-qbo-chrome-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-qbo-chrome-leaves";

const CHECKS = [
  {
    name: "chrome.toolbar_filter: LegalMattersListPage CollapsedListFilters Apply triad",
    file: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
    pattern: /CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}/,
  },
  {
    name: "contracts.create: UnifiedContractCreatorModal is a real ParityDrawer with DatePicker/EntityPicker",
    file: "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
    pattern: /<ParityDrawer[\s\S]*DatePicker[\s\S]*EntityPicker/,
  },
  {
    name: "templates.list: LegalTemplatesListPage CollapsedListFilters + real ParityTable",
    file: "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx",
    pattern: /CollapsedListFilters[\s\S]*<ParityTable/,
  },
  {
    name: "policies: LegalPoliciesPage is a real ParityTable, not a raw <table>",
    file: "apps/frontend/src/pages/legal/LegalPoliciesPage.tsx",
    pattern: /<ParityTable\b/,
  },
  {
    name: "matters.create: LegalMatterFormFields uses real DatePicker/MoneyInput/EntityPicker chrome",
    file: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
    pattern: /DatePicker[\s\S]*MoneyInput[\s\S]*EntityPicker|EntityPicker[\s\S]*MoneyInput[\s\S]*DatePicker/,
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
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".legal-qbo-chrome-selftest-"));
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
console.log(`${LABEL} PASS — ${CHECKS.length} legal qbo_chrome leaf asserts`);
