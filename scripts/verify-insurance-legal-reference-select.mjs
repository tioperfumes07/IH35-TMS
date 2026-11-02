#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL: ENG-60 (2026-11-02) only removed references to the retired insurance.lawsuit surface from this guard; it claims no new scoreboard cell.
/**
 * CHROME-01/PLUS-01 overnight burn-down (2026-07-22) — Insurance + Legal modules.
 *
 * Audit finding: neither module has a vendor/customer/account/category/class/item
 * *catalog* picker (ReferenceSelect's supported createKind list). Every entity picker in
 * these two modules resolves either a catalog or an operational record. Operational create
 * surfaces that explicitly owe picker_law (including insurance claims) reuse their real canonical
 * creator through EntityPicker; filters still never create. This guard locks the absence of dirty
 * QboCombobox / raw UUID datalist regressions and locks the two structural
 * fixes actually shipped tonight:
 *   1. Insurance/legal money create shells (Policy / Claim / Contract / Template /
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

// ENG-60: LawsuitCreateModal retired with insurance.lawsuit — lawsuits are created as legal matters
// (LegalMatterNewPage / LegalMatterFormFields, both still covered by the lists above).

// ── money create shells must be ParityDrawer (QBO side panel), not centered Modal ──
const parityDrawerShells = [
  "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
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

// LV-LEGAL-CONTRACT-CREATE-TEMPLATE-PICKER-NO-ADD-FIRST — contract create Template picker must
// expose Combobox "+ Add new template" first row + canonical LegalTemplateNewModal writer.
const contractCreate = read("apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx");
if (!contractCreate.includes("LegalTemplateNewModal")) {
  failures.push("UnifiedContractCreatorModal must reuse LegalTemplateNewModal for template create");
}
if (!/allowAddNew=\{\{[\s\S]*?label:\s*["']\+ Add new template["']/.test(contractCreate)) {
  failures.push('UnifiedContractCreatorModal Template picker must allowAddNew label "+ Add new template"');
}
if (!contractCreate.includes("legalTemplatesApi.create")) {
  failures.push("UnifiedContractCreatorModal must create templates via legalTemplatesApi.create");
}
if (!contractCreate.includes("templatesQuery.refetch")) {
  failures.push("UnifiedContractCreatorModal must refetch active templates after inline create");
}
if (/Template \(active versions\)[\s\S]*?<SelectCombobox[\s\S]*?Select a template/.test(contractCreate)) {
  failures.push("UnifiedContractCreatorModal Template picker must not regress to SelectCombobox without + Add new");
}

if (failures.length) {
  console.error("FAIL verify-insurance-legal-reference-select:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-insurance-legal-reference-select");
