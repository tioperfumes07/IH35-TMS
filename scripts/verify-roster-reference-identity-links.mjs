#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^home\\.roster$","task":"LINK-F5149-ROSTER-REFERENCE-IDENTITY-LINKS","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  customers: "apps/frontend/src/pages/customers/CustomersListView.tsx",
  vendors: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
  names: "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx",
  users: "apps/frontend/src/pages/Users.tsx",
  customerMatrix: "docs/specs/scoreboard/modules/customers.required.json",
  vendorMatrix: "docs/specs/scoreboard/modules/vendors.required.json",
  listsMatrix: "docs/specs/scoreboard/modules/lists.required.json",
  usersMatrix: "docs/specs/scoreboard/modules/users.required.json",
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function matrixLeaf(source, key, id, routeHint, reverseRequired) {
  let matrix;
  try { matrix = JSON.parse(source[key]); } catch (error) { return [`${key} must parse: ${error.message}`]; }
  const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
  const failures = [];
  if (reverseRequired && !leaf?.required?.includes("reverse_link")) failures.push(`${key}:${id} must inventory reverse_link`);
  if (!reverseRequired && leaf?.required?.includes("reverse_link")) failures.push(`${key}:${id} must not invent reverse_link applicability`);
  if (!leaf?.required?.includes("connectivity")) failures.push(`${key}:${id} must inventory connectivity`);
  if (leaf?.route_hint !== routeHint) failures.push(`${key}:${id} must name ${routeHint}`);
  return failures;
}

export function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("customers", "EntityLinkOrTombstone", "customer roster must tombstone unresolved customer identities");
  need("customers", 'data-testid="customer-roster-record-link"', "customer roster primary identity must stay linked");
  need("customers", 'kind="customer"', "customer roster must drill through the canonical customer resolver");
  need("customers", 'id={row.id}', "customer roster must forward the canonical customer id");
  need("vendors", 'data-testid="vendor-roster-record-link"', "vendor roster primary identity must stay linked");
  need("vendors", 'kind="vendor"', "vendor roster must drill through the canonical vendor resolver");
  need("vendors", 'id={row.id}', "vendor roster must forward the canonical vendor id");
  need("names", 'data-testid="names-master-record-link"', "Names Master canonical identity must stay linked");
  need("names", 'id={row.entity_id}', "Names Master must forward the canonical entity id");
  need("names", 'onClick={() => navigate(row.link_to_module_page)}', "Names Master Open action must honor the backend canonical module route");
  need("users", 'data-testid="user-roster-record-link"', "user roster primary identity must stay linked");
  need("users", 'kind="user"', "user roster must use the canonical EntityLink user kind");
  need("users", 'id={row.id}', "user roster must forward the canonical identity user id");
  need("users", 'onRowClick={(row) => navigate(`/users/${row.id}`)}', "user roster row must preserve its canonical detail drill");
  failures.push(...matrixLeaf(source, "customerMatrix", "home.roster", "/customers", true));
  failures.push(...matrixLeaf(source, "vendorMatrix", "home.roster", "/vendors", false));
  failures.push(...matrixLeaf(source, "listsMatrix", "hub.names_search", "/lists/names", false));
  failures.push(...matrixLeaf(source, "usersMatrix", "detail", "/users/:id", false));
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("roster/reference identity reverse-link guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["customers", "EntityLinkOrTombstone", "EntityLink"],
    ["customers", 'data-testid="customer-roster-record-link"', 'data-testid="broken-customer-link"'],
    ["customers", 'kind="customer"', 'kind="vendor"'],
    ["vendors", 'data-testid="vendor-roster-record-link"', 'data-testid="broken-vendor-link"'],
    ["vendors", 'kind="vendor"', 'kind="customer"'],
    ["names", 'data-testid="names-master-record-link"', 'data-testid="broken-name-link"'],
    ["names", 'id={row.entity_id}', 'id={undefined}'],
    ["names", 'onClick={() => navigate(row.link_to_module_page)}', 'onClick={() => undefined}'],
    ["users", 'data-testid="user-roster-record-link"', 'data-testid="broken-user-link"'],
    ["users", 'kind="user"', 'kind="driver"'],
    ["users", 'id={row.id}', 'id={undefined}'],
    ["users", 'onRowClick={(row) => navigate(`/users/${row.id}`)}', 'onRowClick={() => undefined}'],
    ["customerMatrix", '"id": "home.roster"', '"id": "home.roster.broken"'],
    ["vendorMatrix", '"id": "home.roster"', '"id": "home.roster.broken"'],
    ["listsMatrix", '"id": "hub.names_search"', '"id": "hub.names_search.broken"'],
    ["usersMatrix", '"id": "detail"', '"id": "detail.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}

console.log("PASS: roster/reference identities drill through across Customers, Vendors, Lists, and Users");
