#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8");
}

const policiesPath = "apps/frontend/src/pages/insurance/PoliciesList.tsx";
const modalPath = "apps/frontend/src/components/insurance/PolicyCreateModal.tsx";

const policies = read(policiesPath);
const modal = read(modalPath);

if (!policies) failures.push(`missing:${policiesPath}`);
if (!modal) failures.push(`missing:${modalPath}`);

if (policies && !policies.includes("+ Policy")) failures.push("missing_create_button_label");
if (policies && !policies.includes("PolicyCreateModal")) failures.push("missing_policy_create_modal_usage");
if (policies && !policies.includes("Owner")) failures.push("missing_owner_rbac_gate");
if (policies && !policies.includes("Administrator")) failures.push("missing_administrator_rbac_gate");
if (policies && !policies.includes("Accountant")) failures.push("missing_accountant_rbac_gate");

if (modal && !modal.includes("listInsuranceTypeCatalog")) failures.push("missing_type_catalog_loader");
if (modal && !modal.includes("listUnits")) failures.push("missing_units_loader");
if (modal && !modal.includes("/api/v1/insurance/policies")) failures.push("missing_policies_create_endpoint_usage");
if (modal && !modal.includes('title="Create Policy"')) failures.push("missing_create_policy_modal_title");

if (failures.length > 0) {
  console.error("verify:insurance-policy-create-button FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:insurance-policy-create-button OK");
