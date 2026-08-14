#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow"],"cols":["vendor"],"leafRe":"^cash-flow\\.panel\\.projection$","task":"WAVE-A-VENDOR-INLINE-SURFACE"} */
import fs from "node:fs";
const ui=fs.readFileSync("apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx","utf8");
const route=fs.readFileSync("apps/backend/src/forecast/cash-forecast-manual.routes.ts","utf8");
const fail=(u,r)=>[
  ["picker",u.includes('<EntityPicker kind="vendor"')],
  ["payload",u.includes("party_ref_id: form.party_ref_id || null")],
  ["drill",u.includes('e.party_ref_kind === "vendor"')],
  ["scope",/FROM mdata\.vendors WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(r)],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){if(!fail(ui,route.replaceAll("operating_company_id = $2::uuid","TRUE")).includes("scope"))process.exit(1);console.log("verify-vendor-inline-surface-linkage selftest PASS — scope mutation red");}
const missing=fail(ui,route);if(missing.length){console.error(`verify-vendor-inline-surface-linkage FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-vendor-inline-surface-linkage PASS — picker/payload/company scope/reload drill");
