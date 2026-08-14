#!/usr/bin/env node
/** Product guard for mounted cross-module connectivity doors. */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  cashFlow: "apps/frontend/src/pages/cash-flow/CashFlowPage.tsx",
  finance: "apps/frontend/src/pages/finance/FinanceModuleTabs.tsx",
  homeOwner: "apps/frontend/src/pages/home/OwnerHome.tsx",
  homeQbo: "apps/frontend/src/pages/home/QboStyleHomePage.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("cashFlow", 'data-testid="cash-flow-cross-module-links"', "Cash Flow must expose a named related-module navigation surface");
  need("cashFlow", 'to="/banking"', "Cash Flow must link to Banking");
  need("cashFlow", 'to="/reports/cash-flow-statement"', "Cash Flow must link to the cash-flow statement");
  need("cashFlow", 'to="/reports/cash-flow"', "Cash Flow must link to the cash-flow report");
  need("cashFlow", 'to="/reports/cash-flow-overview"', "Cash Flow must link to the cash-flow overview");
  need("cashFlow", 'to="/drivers?subtab=cash_advances"', "Cash Flow must link to canonical cash advances");
  need("finance", 'data-testid="finance-cross-module-links"', "Finance must expose a named related-module navigation surface");
  need("finance", 'to="/accounting"', "Finance must link to Accounting");
  need("finance", 'to="/cash-flow"', "Finance must link to Cash Flow");
  need("finance", 'to="/reports/profit-loss"', "Finance must link to the P&L report");
  need("homeOwner", 'to="/banking"', "Owner Home must retain its Banking jump");
  need("homeQbo", 'to="/accounting/invoices"', "Home must retain its Accounting invoices jump");
  for (const route of ["/banking", "/reports/cash-flow-statement", "/reports/cash-flow", "/reports/cash-flow-overview", "/drivers", "/accounting", "/cash-flow", "/reports/profit-loss"]) {
    need("routes", `path="${route}"`, `route ${route} must remain mounted`);
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("cross-module connectivity-door guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["cashFlow", 'data-testid="cash-flow-cross-module-links"', 'data-testid="broken-cross-module-links"'],
    ["cashFlow", 'to="/banking"', 'to="/cash-flow"'],
    ["cashFlow", 'to="/reports/cash-flow-statement"', 'to="/reports"'],
    ["cashFlow", 'to="/reports/cash-flow"', 'to="/reports"'],
    ["cashFlow", 'to="/reports/cash-flow-overview"', 'to="/reports"'],
    ["cashFlow", 'to="/drivers?subtab=cash_advances"', 'to="/drivers"'],
    ["finance", 'data-testid="finance-cross-module-links"', 'data-testid="broken-finance-links"'],
    ["finance", 'to="/accounting"', 'to="/finance"'],
    ["finance", 'to="/cash-flow"', 'to="/finance"'],
    ["finance", 'to="/reports/profit-loss"', 'to="/reports"'],
    ["homeOwner", 'to="/banking"', 'to="/"'],
    ["homeQbo", 'to="/accounting/invoices"', 'to="/accounting"'],
    ["routes", 'path="/reports/cash-flow-statement"', 'path="/reports/cash-flow-statement-broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: Cash Flow, Finance, and Home expose mounted cross-module connectivity doors");
