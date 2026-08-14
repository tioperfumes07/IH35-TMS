#!/usr/bin/env node
import fs from "node:fs";
const page = fs.readFileSync("apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx", "utf8");
const route = fs.readFileSync("apps/backend/src/lists/oem-parts.routes.ts", "utf8");
const matrix = () => JSON.parse(fs.readFileSync("docs/specs/scoreboard/modules/lists.required.json", "utf8"));
const failures = (m = matrix()) => [
  ["OEM unit N/A", !m.leaves.find((leaf) => leaf.id === "lists.modal.oem_parts_create")?.required?.includes("unit")],
  ["no unit field submitted", !page.includes("unit_id") && !page.includes("unit_uuid")],
  ["global reference write", route.includes("INSERT INTO reference.oem_parts")],
].filter(([, ok]) => !ok).map(([name]) => name);
if (process.argv.includes("--selftest")) { const m=matrix(); m.leaves.find((leaf)=>leaf.id==="lists.modal.oem_parts_create").required.push("unit"); if(!failures(m).includes("OEM unit N/A"))process.exit(1); console.log("verify-unit-oem-reference-applicability selftest PASS — false unit mutation red"); process.exit(0); }
const missing=failures(); if(missing.length){console.error(`verify-unit-oem-reference-applicability FAIL — ${missing.join(", ")}`);process.exit(1);} console.log("verify-unit-oem-reference-applicability PASS — global OEM template owns no canonical unit FK");
