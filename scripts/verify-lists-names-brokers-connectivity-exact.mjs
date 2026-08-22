#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.names_master.brokers.list","catalog.names_master.brokers.create"],"task":"LISTS-F5971-NAMES-BROKERS-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-names-brokers-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  hub: "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx",
  page: "apps/frontend/src/pages/lists/names/BrokersListPage.tsx",
  drawer: "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
  form: "apps/frontend/src/components/customers/CustomerProfileForm.tsx",
  api: "apps/frontend/src/api/mdata.ts",
  backend: "apps/backend/src/mdata/customers.routes.ts",
};
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(s = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, s[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(s.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  for (const suffix of ["list", "create"]) {
    const id = `catalog.names_master.brokers.${suffix}`;
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
    if (leaf?.route_hint !== "/lists/names/brokers") failures.push(`${id} route drifted`);
  }
  if (!src.manifest.includes('path="/lists/names/brokers"') || !src.manifest.includes("<BrokersListPage />")) failures.push("Brokers route missing");
  if (!src.hub.includes('name: "Brokers"') || !src.hub.includes('catalogKey: "brokers"')) failures.push("Names hub Broker tile missing");
  for (const token of ["selectedCompanyId", "operating_company_id: companyId", 'customer_type: "broker"', 'status: "active"', 'kind="customer"', "+ Create broker", 'fixedCustomerType="broker"', "void query.refetch()"])
    if (!src.page.includes(token)) failures.push(`Brokers list/create chain missing ${token}`);
  for (const token of ["fixedCustomerType", "emptyCustomerProfileValues()", "customer_type: fixedCustomerType", "createCustomer(profileValuesToCreatePayload(values, operatingCompanyId))", 'invalidateQueries({ queryKey: ["customers"] })'])
    if (!src.drawer.includes(token)) failures.push(`canonical customer drawer missing ${token}`);
  if (!src.form.includes("lockedCustomerType") || !src.form.includes("disabled={Boolean(lockedCustomerType)}") || !src.form.includes("customer_type: v.customer_type || undefined")) failures.push("canonical form must lock and submit Broker role");
  if (!/export function createCustomer[\s\S]{0,180}\/api\/v1\/mdata\/customers"[\s\S]{0,100}method: "POST"/.test(src.api)) failures.push("frontend canonical customer creator missing");
  if (!/app\.post\("\/api\/v1\/mdata\/customers", RL_WRITE/.test(src.backend) || !src.backend.includes("resolveOperatingCompanyId") || !src.backend.includes("operating_company_id")) failures.push("backend canonical scoped customer writer missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.names_master.brokers.create"', '"id": "catalog.names_master.brokers.create.broken"')],
    ["manifest", original.manifest.replace('path="/lists/names/brokers"', 'path="/lists/names/brokers-broken"')],
    ["hub", original.hub.replace('catalogKey: "brokers"', 'catalogKey: "brokers-broken"')],
    ["page", original.page.replace('customer_type: "broker"', 'customer_type: "direct_shipper"')],
    ["page", original.page.replace('fixedCustomerType="broker"', 'fixedCustomerType="direct_shipper"')],
    ["drawer", original.drawer.replace("createCustomer(profileValuesToCreatePayload(values, operatingCompanyId))", "Promise.resolve(values)")],
    ["form", original.form.replace("disabled={Boolean(lockedCustomerType)}", "disabled={false}")],
    ["api", original.api.replace('apiRequest<Customer>("/api/v1/mdata/customers", { method: "POST"', 'apiRequest<Customer>("/api/v1/mdata/customers-broken", { method: "POST"')],
    ["backend", original.backend.replace('app.post("/api/v1/mdata/customers", RL_WRITE', 'app.post("/api/v1/mdata/customers-broken", RL_WRITE')],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-names-brokers-connectivity-exact SELFTEST PASS — ${mutants.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-names-brokers-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-names-brokers-connectivity-exact PASS — scoped Broker roster drills to customers and canonical locked-Broker creator writes/reloads the same table");
