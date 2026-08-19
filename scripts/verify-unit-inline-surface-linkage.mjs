#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","cash-flow"],"cols":["unit"],"leafRe":"^(accounting\\.panel\\.detail|cash-flow\\.panel\\.projection)$","task":"WAVE-A-UNIT-INLINE-SURFACES"} */
import fs from "node:fs";
const ui=fs.readFileSync("apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx","utf8");
const route=fs.readFileSync("apps/backend/src/forecast/cash-forecast-manual.routes.ts","utf8");
const detail=fs.readFileSync("apps/frontend/src/pages/accounting/FixedAssetsPage.tsx","utf8");
const fail=(u,r,d)=>[
 ["picker",u.includes('<EntityPicker key={c.key} kind="unit"')],
 ["payload",u.includes("ref_external_id: form.ref_external_id || null")],
 // CC-2 GUARD 2026-08-19: re-anchored — swapped to the EntityLinkOrTombstone honesty wrapper
 // (renders plain text for a null/unresolved unit instead of a dead link), same real id.
 ["reload drill",u.includes('<EntityLinkOrTombstone kind="unit" id={e.ref_external_id}')],
 ["scope",/FROM mdata\.units WHERE id = \$1::uuid AND COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/.test(r)],
 ["fixed asset drill",d.includes('<EntityLink kind="unit" id={detail.unit_uuid}')],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){if(!fail(ui,route.replaceAll("COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid","TRUE"),detail).includes("scope"))process.exit(1);console.log("verify-unit-inline-surface-linkage selftest PASS — scope mutation red");}
const missing=fail(ui,route,detail);if(missing.length){console.error(`verify-unit-inline-surface-linkage FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-unit-inline-surface-linkage PASS — picker/payload/company scope/reload + fixed asset drill");
