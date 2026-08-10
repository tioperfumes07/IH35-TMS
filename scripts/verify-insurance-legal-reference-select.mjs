#!/usr/bin/env node
/**
 * CHROME-01/PLUS-01 overnight burn-down (2026-07-22) — Insurance + Legal modules.
 *
 * Audit finding: neither module has a vendor/customer/account/category/class/item
 * *catalog* picker (ReferenceSelect's supported createKind list). Every entity picker in
 * these two modules resolves an operational record — insurance policy/claim/lawsuit,
 * driver, unit, load, accident report, legal matter/contract signer — none of which are
 * catalog entities with an inline "+ Add new" quick-create backend. This guard locks that
 * finding (no QboCombobox / raw UUID datalist regressions) and locks the two structural
 * fixes actually shipped tonight:
 *   1. Insurance/legal money create shells (Policy / Claim / Lawsuit / Contract / Template /
 *      Lease-to-Own / Truck Lease) run on ParityDrawer (QBO side panel), not centered Modal.
 *   2. Always-on Status/Type/Severity filter strips collapse behind CollapsedListFilters.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

// ── no dirty catalog-picker regressions in insurance/legal ──
const noDirtyPickerFiles = [
  "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
  "apps/frontend/src/components/insurance/LawsuitCreateModal.tsx",
  "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
  "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  "apps/frontend/src/pages/legal/contracts/SendContractModal.tsx",
  "apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx",
  "apps/frontend/src/pages/legal/contracts/TruckLeaseCreatorModal.tsx",
  "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx",
  "apps/frontend/src/pages/legal/templates/LegalTemplateNewModal.tsx",
];
for (const rel of noDirtyPickerFiles) {
  const src = read(rel);
  if (src.includes("QboCombobox")) {
    failures.push(`${rel} must not use QboCombobox (no QBO-account picker belongs in insurance/legal)`);
  }
  if (src.includes("<datalist")) {
    failures.push(`${rel} must not use a raw UUID <datalist> picker — use SelectCombobox/ReferenceSelect`);
  }
}

const lawsuitCreate = read("apps/frontend/src/components/insurance/LawsuitCreateModal.tsx");
if (!/<EntityPicker[\s\S]*?kind=["']insurance_claim["'][\s\S]*?allowCreate=\{false\}/.test(lawsuitCreate)) {
  failures.push("LawsuitCreateModal linked claim must use EntityPicker kind=insurance_claim in filter mode");
}
if (/<select[\s\S]*?value=\{form\.claim_id\}/.test(lawsuitCreate)) {
  failures.push("LawsuitCreateModal linked claim must not regress to a native UUID-valued select");
}

// ── money create shells must be ParityDrawer (QBO side panel), not centered Modal ──
const parityDrawerShells = [
  "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
  "apps/frontend/src/components/insurance/LawsuitCreateModal.tsx",
  "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  "apps/frontend/src/pages/legal/contracts/SendContractModal.tsx",
  "apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx",
  "apps/frontend/src/pages/legal/contracts/TruckLeaseCreatorModal.tsx",
  "apps/frontend/src/pages/legal/templates/LegalTemplateNewModal.tsx",
];
for (const rel of parityDrawerShells) {
  const src = read(rel);
  if (!src.includes("ParityDrawer")) {
    failures.push(`${rel} must use ParityDrawer (QBO side panel) for its create/edit shell`);
  }
  if (/<Modal[\s/>]/.test(src) || /from ["'][./]*components\/Modal["']/.test(src)) {
    failures.push(`${rel} must not import/render the centered Modal shell — ParityDrawer only`);
  }
}

// ── always-on filter strips must collapse behind CollapsedListFilters ──
const collapsedFilterPages = [
  "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
  "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx",
];
for (const rel of collapsedFilterPages) {
  const src = read(rel);
  if (!src.includes("CollapsedListFilters")) {
    failures.push(`${rel} filter strip must collapse behind CollapsedListFilters (QBO-style Filters popover)`);
  }
}

if (failures.length) {
  console.error("FAIL verify-insurance-legal-reference-select:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-insurance-legal-reference-select");
