#!/usr/bin/env node
/**
 * ACCT-CHROME-UNIFORM-01 / CTL-04 — Accounting money lists expose exactly ONE create control via
 * AccountingSubNavWrapper.createControl (not a duplicate + Create in actions alongside module
 * "+ Create ▾"). Batch Void buttons use shared Button danger sm.
 *
 * Self-test: node scripts/verify-accounting-toolbar-one-create.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-toolbar-one-create";

const CHECKS = [
  {
    name: "wrapper: createControl prop + toolbar slot",
    file: "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx",
    pattern: /createControl\?: ReactNode[\s\S]*data-accounting-toolbar="true"[\s\S]*\{createControl \?/,
  },
  {
    name: "BillsPage: createControl with bills-create-cta (not actions)",
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    pattern: /<AccountingSubNavWrapper[\s\S]*createControl=\{[\s\S]*data-testid="bills-create-cta"[\s\S]*\+ Create/,
  },
  {
    name: "BillsPage: wrapper call has no actions prop",
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    pattern: /<AccountingSubNavWrapper(?![\s\S]*\bactions=)[\s\S]*createControl=/,
  },
  {
    name: "ExpensesListPage: createControl + Create",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create/,
  },
  {
    name: "InvoicesListPage: createControl holds type Select + Create",
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    pattern: /createControl=\{[\s\S]*SelectCombobox[\s\S]*className="h-8 text-(?:xs|\[13px\])"[\s\S]*\+ Create/,
  },
  {
    name: "InvoicesListPage: batch Void uses Button danger sm",
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    pattern: /batchActions=\{\(selected\)[\s\S]*variant="danger"[\s\S]*Void/,
  },
  {
    name: "PaymentsListPage: createControl Record Payment + actions Invoices only",
    file: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
    pattern: /actions=\{<Button variant="secondary"[\s\S]*Invoices[\s\S]*createControl=\{<Button[\s\S]*\+ Record Payment/,
  },
  {
    name: "ManualJEListPage: createControl + Create",
    file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
    pattern: /createControl=\{<Button[\s\S]*\+ Create/,
  },
  // CTL-04 — surfaces that previously duplicated module "+ Create ▾" via actions=
  {
    name: "CreditMemosPage: createControl + Create (not actions)",
    file: "apps/frontend/src/pages/accounting/CreditMemosPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create/,
  },
  {
    name: "VendorCreditsPage: createControl + Create (not actions)",
    file: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create/,
  },
  {
    name: "AccountingHubPage: createControl Manual JE (not actions)",
    file: "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create Manual JE/,
  },
  {
    name: "PaymentMethodsCatalogPage: createControl + Create",
    file: "apps/frontend/src/pages/accounting/PaymentMethodsCatalogPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create/,
  },
  {
    name: "ExpenseCategoryMapPage: createControl Mapping",
    file: "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create Mapping/,
  },
  {
    name: "AccountTypeCatalogPage: createControl + Create",
    file: "apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create/,
  },
  {
    name: "PrepaidExpensesPage: createControl Prepaid",
    file: "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create Prepaid/,
  },
  {
    name: "BillPaymentsListPage: createControl Record Bill Payment",
    file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Record Bill Payment/,
  },
];

/** Walk accounting TSX: Create/Record CTA must not live in actions= without createControl= on same wrapper open. */
function scanActionCreateDupes(root = ROOT) {
  const fails = [];
  const dir = path.join(root, "apps/frontend/src/pages/accounting");
  if (!fs.existsSync(dir)) return fails;

  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "__tests__" || ent.name === "tests") continue;
        walk(abs);
        continue;
      }
      if (!ent.name.endsWith(".tsx")) continue;
      const src = fs.readFileSync(abs, "utf8");
      if (!src.includes("AccountingSubNavWrapper")) continue;
      const parts = src.split("<AccountingSubNavWrapper");
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const end = part.search(/\n\s*>/);
        const block = end === -1 ? part.slice(0, 1200) : part.slice(0, end);
        const hasCreateControl = /\bcreateControl=/.test(block);
        const actionsMatch = block.match(/\bactions=\{([\s\S]*)/);
        if (!actionsMatch) continue;
        const actionsBlob = actionsMatch[1];
        if (/\+\s*(Create|Record)\b/.test(actionsBlob) && !hasCreateControl) {
          fails.push(
            `${path.relative(root, abs)}: wrapper#${i} has + Create/+ Record in actions= without createControl= (CTL-04)`,
          );
        }
      }
    }
  }
  walk(dir);
  return fails;
}

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    const hit = c.pattern.test(src);
    if (!hit) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  fails.push(...scanActionCreateDupes(root));
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".acct-toolbar-one-create-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — createControl stripped\nexport {};\n");
    }
    // Plant CTL-04 dupe: actions Create without createControl
    const plant = path.join(tmp, "apps/frontend/src/pages/accounting/PlantDupCreate.tsx");
    fs.mkdirSync(path.dirname(plant), { recursive: true });
    fs.writeFileSync(
      plant,
      `export function Plant() {\n  return (\n    <AccountingSubNavWrapper\n      title="X"\n      actions={<button>+ Create</button>}\n    >\n      <div />\n    </AccountingSubNavWrapper>\n  );\n}\n`,
    );
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted misses not caught (${planted.length}/${CHECKS.length})`);
      process.exit(1);
    }
    if (!planted.some((f) => f.includes("PlantDupCreate") && f.includes("CTL-04"))) {
      console.error(`${LABEL} SELFTEST FAIL — CTL-04 action-dupe scan did not trip planted file`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length}; CTL-04 scan OK)`);
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
console.log(`${LABEL} PASS — ${CHECKS.length} asserts + CTL-04 action-dupe scan`);
