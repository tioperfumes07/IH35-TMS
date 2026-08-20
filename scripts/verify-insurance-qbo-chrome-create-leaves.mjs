#!/usr/bin/env node
/**
 * Insurance qbo_chrome — leaf-specific Built for the 5 create/list leaves that were only claimed
 * by the broad CURSOR-VERTICAL-insurance-qbo sweep (leafRe: ^(chrome|claims|lawsuits|policies|
 * type_catalog)(\.|$)) — that guard verifies generic shared-component files (ReportsHome,
 * RunnerFilters, BillsPage, MaintenanceHome...) and never touches an insurance file for these 5
 * leaves at all, so it is theater for THIS module's own claim. This guard adds real, leaf-specific
 * checks against insurance's own real components: every create surface is a real ParityDrawer with
 * DatePicker/MoneyInput/EntityPicker chrome (not a hand-rolled modal), and the type catalog list is
 * a real ParityTable (not a raw <table>).
 *
 * Found 2026-08-20 (CC-3), same sweep that added
 * scripts/verify-insurance-qbo-chrome-toolbar-filter.mjs for chrome.toolbar_filter.
 *
 * @matrix-built {"modules":["insurance"],"cols":["qbo_chrome"],"leafRe":"^policies\\.create$","task":"VERTICAL-QBO-CHROME-insurance-policies-create","vertical":"column-wave"}
 * @matrix-built {"modules":["insurance"],"cols":["qbo_chrome"],"leafRe":"^type_catalog\\.list$","task":"VERTICAL-QBO-CHROME-insurance-type-catalog-list","vertical":"column-wave"}
 * @matrix-built {"modules":["insurance"],"cols":["qbo_chrome"],"leafRe":"^type_catalog\\.create$","task":"VERTICAL-QBO-CHROME-insurance-type-catalog-create","vertical":"column-wave"}
 * @matrix-built {"modules":["insurance"],"cols":["qbo_chrome"],"leafRe":"^claims\\.create$","task":"VERTICAL-QBO-CHROME-insurance-claims-create","vertical":"column-wave"}
 * @matrix-built {"modules":["insurance"],"cols":["qbo_chrome"],"leafRe":"^lawsuits\\.create$","task":"VERTICAL-QBO-CHROME-insurance-lawsuits-create","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-insurance-qbo-chrome-create-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-insurance-qbo-chrome-create-leaves";

const CHECKS = [
  {
    name: "policies.create: PolicyCreateWizard is a real ParityDrawer with DatePicker/MoneyInput/EntityPicker",
    file: "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
    pattern: /<ParityDrawer[\s\S]*EntityPicker[\s\S]*DatePicker[\s\S]*MoneyInput[\s\S]*<\/ParityDrawer>/,
  },
  {
    name: "policies.create: PolicyCreateModal (legacy fallback) is also a real ParityDrawer with the same chrome",
    file: "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
    pattern: /<ParityDrawer[\s\S]*EntityPicker[\s\S]*DatePicker[\s\S]*MoneyInput/,
  },
  {
    name: "type_catalog.list: TypeCatalogAdmin roster is a real ParityTable, not a raw <table>",
    file: "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx",
    pattern: /<ParityTable</,
  },
  {
    name: "claims.create: ClaimCreateModal is a real ParityDrawer with DatePicker/MoneyInput/EntityPicker",
    file: "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
    pattern: /<ParityDrawer[\s\S]*EntityPicker[\s\S]*DatePicker[\s\S]*MoneyInput/,
  },
  {
    name: "lawsuits.create: LawsuitCreateModal is a real ParityDrawer with DatePicker/MoneyInput/EntityPicker",
    file: "apps/frontend/src/components/insurance/LawsuitCreateModal.tsx",
    pattern: /<ParityDrawer[\s\S]*DatePicker[\s\S]*EntityPicker[\s\S]*MoneyInput/,
  },
];

// type_catalog.create is a deliberate inline "+ Create type" form on the same TypeCatalogAdmin page
// (not a drawer) — check its own file separately since the pattern shape differs from the modals.
const INLINE_CHECK = {
  name: "type_catalog.create: TypeCatalogAdmin's inline + Create type form is wired to a real mutation",
  file: "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx",
  pattern: /createInsuranceTypeCatalog[\s\S]*\+ Create type/,
};

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of [...CHECKS, INLINE_CHECK]) {
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
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".insurance-qbo-chrome-create-selftest-"));
  try {
    for (const c of [...CHECKS, INLINE_CHECK]) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length + 1) {
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
console.log(`${LABEL} PASS — ${CHECKS.length + 1} insurance policies/type_catalog/claims/lawsuits qbo_chrome leaf asserts`);
