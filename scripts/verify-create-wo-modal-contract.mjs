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

  // Vehicle picker: accept maintenance catalog list OR EntityPicker kind=unit (server search +
  // canonical mdata.units — same upgrade path as DriverPickerWithCreate for drivers).
  const hasMaintenanceVehicleQuery = identification.includes("listMaintenanceVehicles");
  const hasEntityPickerUnit = /EntityPicker[\s\S]*?kind=["']unit["']/.test(identification);
  if (!hasMaintenanceVehicleQuery && !hasEntityPickerUnit) {
    failures.push("missing_catalog_picker_queries:vehicles");
  }
  // Driver picker: accept EITHER the original maintenance-scoped query OR the shared
  // <DriverPickerWithCreate> (PLUS-DRIVER-SYSTEM). The shared picker is not a downgrade — it reads
  // canonical mdata.drivers, its operating_company_id is a REQUIRED param (compile-time enforced,
  // so the entity scope cannot be silently dropped), and it passes limit:200 which clears the
  // known 50-row driver-picker truncation landmine. What must never happen is the driver picker
  // losing its entity scope or its data source entirely — that is what is asserted here.
  const hasMaintenanceDriverQuery = identification.includes("listMaintenanceDrivers");
  const hasSharedDriverPicker = identification.includes("DriverPickerWithCreate");
  if (!hasMaintenanceDriverQuery && !hasSharedDriverPicker) {
    failures.push("missing_catalog_picker_queries:drivers");
  }
  if (hasMaintenanceDriverQuery && !identification.includes("operatingCompanyId")) {
    failures.push("driver_query_lost_entity_scope");
  }

  if (identification.includes("QBO vendor lookup (appends to Description)")) {
    failures.push("duplicate_vendor_lookup_field_present");
  }

  // Accept legacy Combobox row.id mirror OR ReferenceSelect next/opt.value mirror.
  const mirrorsExternalVendor =
    identification.includes('setValue("external_vendor_id", row.id') ||
    /setValue\(\s*["']external_vendor_id["']\s*,\s*(next|opt\.value)/.test(identification);
  if (!mirrorsExternalVendor) {
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
