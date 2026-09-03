#!/usr/bin/env node
import fs from "node:fs";

const registry = fs.readFileSync("apps/frontend/src/components/parity/entityPickerRegistry.ts", "utf8");
const picker = fs.readFileSync("apps/frontend/src/components/EntityPicker.tsx", "utf8");
const creator = fs.readFileSync("apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx", "utf8");
const cashFlow = fs.readFileSync("apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx", "utf8");

function failures(source = registry) {
  return [
    ["typed customer kind", source.includes('| "customer"')],
    ["canonical table identity", source.includes('readTable: "mdata.customers"') && source.includes('writeTable: "mdata.customers"')],
    ["company-scoped roster", source.includes("operating_company_id: operatingCompanyId") && source.includes("await listCustomers({")],
    ["human labels", source.includes("label: customer.name")],
    ["inline create declared", source.includes('kind: "customer"') && source.includes("inlineCreate: { available: true }")],
    ["real creator mounted", picker.includes('kind="customer"') && picker.includes('kind === "customer"')],
    ["canonical creator write", creator.includes("createCustomer(profileValuesToCreatePayload(values, operatingCompanyId))")],
    ["created id returned", creator.includes("onCreated({ id: customer.id, label })")],
    ["cash-flow consumer", cashFlow.includes('kind="customer"')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const planted = registry.replace('readTable: "mdata.customers"', 'readTable: "mdata.customer_shadow"');
  if (!failures(planted).includes("canonical table identity")) process.exit(1);
  console.log("verify-customer-entity-picker-kind selftest PASS — table split mutation red");
  process.exit(0);
}
const missing = failures();
if (missing.length) {
  console.error(`verify-customer-entity-picker-kind FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-customer-entity-picker-kind PASS — scoped roster→same-table creator→selected id");
