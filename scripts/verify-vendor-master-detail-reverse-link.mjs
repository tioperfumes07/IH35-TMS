#!/usr/bin/env node
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^md\.vendor_details$","task":"VERTICAL-REVERSE-LINK-VENDOR-MASTER-DETAIL"} */
import fs from "node:fs";
const source=fs.readFileSync("apps/frontend/src/pages/Vendors.tsx","utf8");
const matrix=fs.readFileSync("docs/specs/scoreboard/modules/vendors.required.json","utf8");
const failures=(value=source)=>[
 ["exact required leaf",matrix.includes('"id": "md.vendor_details"')&&matrix.includes('"reverse_link"')],
 ["selected row surface",value.includes('data-testid="vendor-master-detail-profile"')],
 ["canonical vendor identity",value.includes('<EntityLink kind="vendor" id={selectedVendor.id} label={selectedVendor.name} />')],
 ["profile drill-through",value.includes('navigate(`/vendors/${selectedVendor.id}`)')],
 ["real selected fields",value.includes("selectedVendor.vendor_code")&&value.includes("selectedVendor.vendor_type")],
 ["placeholder removed",!value.includes("Vendor details are shown in the header section for this layout.")],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const planted=source.replace('<EntityLink kind="vendor" id={selectedVendor.id} label={selectedVendor.name} />',"<span>{selectedVendor.name}</span>");if(!failures(planted).includes("canonical vendor identity"))process.exit(1);console.log("verify-vendor-master-detail-reverse-link selftest PASS — EntityLink mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-vendor-master-detail-reverse-link FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-vendor-master-detail-reverse-link PASS — selected vendor→canonical profile drill-through");
