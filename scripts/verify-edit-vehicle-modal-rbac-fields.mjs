import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const modalPath = path.join(root, "apps/frontend/src/components/fleet/EditVehicleModal.tsx");
const schemaPath = path.join(root, "apps/backend/src/mdata/unit-update-schema.ts");
const modalSrc = fs.readFileSync(modalPath, "utf8");
const schemaSrc = fs.readFileSync(schemaPath, "utf8");

const ownerFields = ["sold_price", "sold_to", "transferred_date", "transferred_to_entity", "repair_estimate"];

if (!modalSrc.includes("ownerOnly: true")) {
  console.error("[verify-edit-vehicle-modal-rbac-fields] Missing ownerOnly markers in EditVehicleModal.tsx");
  process.exit(1);
}
for (const field of ownerFields) {
  if (!modalSrc.includes(field)) {
    console.error(`[verify-edit-vehicle-modal-rbac-fields] Missing field ${field} in EditVehicleModal.tsx`);
    process.exit(1);
  }
}
if (!schemaSrc.includes("UNIT_PATCH_OWNER_ONLY_COLUMNS")) {
  console.error("[verify-edit-vehicle-modal-rbac-fields] Missing UNIT_PATCH_OWNER_ONLY_COLUMNS in unit-update-schema.ts");
  process.exit(1);
}

console.log("[verify-edit-vehicle-modal-rbac-fields] OK");
