#!/usr/bin/env node
import fs from "node:fs";
const page=fs.readFileSync("apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx","utf8");
const route=fs.readFileSync("apps/backend/src/lists/oem-parts.routes.ts","utf8");
const matrix=()=>JSON.parse(fs.readFileSync("docs/specs/scoreboard/modules/lists.required.json","utf8"));
const failures=(m=matrix())=>[
 ["OEM trailer N/A",!m.leaves.find(l=>l.id==="lists.modal.oem_parts_create")?.required?.includes("trailer")],
 ["no trailer field submitted",!page.includes("trailer_id")&&!page.includes("equipment_id")],
 ["global reference write",route.includes("INSERT INTO reference.oem_parts")],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){const m=matrix();m.leaves.find(l=>l.id==="lists.modal.oem_parts_create").required.push("trailer");if(!failures(m).includes("OEM trailer N/A"))process.exit(1);console.log("verify-trailer-oem-reference-applicability selftest PASS — false trailer mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-trailer-oem-reference-applicability FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-trailer-oem-reference-applicability PASS — global OEM template owns no canonical trailer FK");
