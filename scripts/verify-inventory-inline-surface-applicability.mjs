#!/usr/bin/env node
import fs from "node:fs";
const page = fs.readFileSync("apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx", "utf8");
const route = fs.readFileSync("apps/backend/src/lists/oem-parts.routes.ts", "utf8");
const matrix = () => JSON.parse(fs.readFileSync("docs/specs/scoreboard/modules/lists.required.json", "utf8"));
const failures = (m = matrix()) => [
  ["OEM create inventory N/A", !m.leaves.find((leaf) => leaf.id === "lists.modal.oem_parts_create")?.required?.includes("inventory")],
  ["UI distinguishes reference from stock", page.includes("This is not company parts inventory") && page.includes("use Maintenance Parts for stocked items")],
  ["write targets reference templates", route.includes("INSERT INTO reference.oem_parts")],
  ["write does not target stock", !route.includes("INSERT INTO catalogs.parts")],
].filter(([, ok]) => !ok).map(([name]) => name);
if (process.argv.includes("--selftest")) {
  const m = matrix(); m.leaves.find((leaf) => leaf.id === "lists.modal.oem_parts_create").required.push("inventory");
  if (!failures(m).includes("OEM create inventory N/A")) process.exit(1);
  console.log("verify-inventory-inline-surface-applicability selftest PASS — false stock requirement mutation red"); process.exit(0);
}
const missing = failures(); if (missing.length) { console.error(`verify-inventory-inline-surface-applicability FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-inventory-inline-surface-applicability PASS — OEM reference templates are not company parts inventory");
