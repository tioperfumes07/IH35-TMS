import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const modalPath = path.join(root, "apps/frontend/src/components/fleet/EditVehicleModal.tsx");
const src = fs.readFileSync(modalPath, "utf8");

const requiredTabs = [
  "Identity",
  "Insurance",
  "IRP / Plates",
  "Reefer",
  "Financial",
  "Lifecycle",
  "Quick-availability",
  "Documents",
];

const missing = requiredTabs.filter((tab) => !src.includes(`"${tab}"`));
if (missing.length > 0) {
  console.error("[verify-edit-vehicle-modal-tabs-complete] Missing tab labels:", missing.join(", "));
  process.exit(1);
}

console.log("[verify-edit-vehicle-modal-tabs-complete] OK");
