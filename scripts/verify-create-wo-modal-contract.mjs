#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const identificationPath = path.join(
  ROOT,
  "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx"
);
const modalPath = path.join(
  ROOT,
  "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx"
);

const REQUIRED_SOURCE_TYPES = ["IS", "ES", "AC", "ET", "RT", "IT", "RS"];

function read(pathname) {
  if (!fs.existsSync(pathname)) {
    throw new Error(`missing_file:${pathname}`);
  }
  return fs.readFileSync(pathname, "utf8");
}

function main() {
  const failures = [];
  const identification = read(identificationPath);
  const modal = read(modalPath);

  for (const sourceType of REQUIRED_SOURCE_TYPES) {
    if (!identification.includes(`value: "${sourceType}"`)) {
      failures.push(`missing_source_type_option:${sourceType}`);
    }
  }

  if (!identification.includes("listMaintenanceVehicles") || !identification.includes("listMaintenanceDrivers")) {
    failures.push("missing_catalog_picker_queries");
  }

  if (identification.includes("QBO vendor lookup (appends to Description)")) {
    failures.push("duplicate_vendor_lookup_field_present");
  }

  if (!identification.includes("setValue(\"external_vendor_id\", row.id")) {
    failures.push("vendor_not_mirrored_to_external_vendor_id");
  }

  if (!modal.includes("external_vendor_id: needsExternalVendor ? canonicalVendorId : undefined")) {
    failures.push("canonical_vendor_not_applied_on_submit");
  }

  if (failures.length > 0) {
    console.error("verify:create-wo-modal-contract FAIL");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("verify:create-wo-modal-contract OK");
}

main();
