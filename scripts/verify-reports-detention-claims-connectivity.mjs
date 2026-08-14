#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^runner\.detention_claims$","task":"VERTICAL-CONNECTIVITY-REPORTS-DETENTION-CLAIMS"} */
import fs from "node:fs";
const b=fs.readFileSync("apps/backend/src/reports/detention-claims.routes.ts","utf8");
const l=fs.readFileSync("apps/backend/src/reports/shared.ts","utf8");
const c=fs.readFileSync("apps/frontend/src/pages/reports/runners/runner-config.ts","utf8");
const r=fs.readFileSync("apps/frontend/src/pages/reports/ReportsRunner.tsx","utf8");
const failures=(source=b)=>[
 ["real library",l.slice(l.indexOf('id: "detention-claims"'),l.indexOf('id: "detention-claims"')+400).includes('status: "real"')],
 ["runner",c.includes('"detention-claims": {')&&c.includes('apiPath: "/api/v1/reports/detention-claims"')],
 ["range",r.includes('reportId === "detention-claims"')],
 ["scope",source.includes("withCompanyScope(user.uuid, parsed.data.operating_company_id")&&source.includes("de.operating_company_id = $1::uuid")],
 ["lineage",source.includes("FROM dispatch.detention_events de")&&source.includes("LEFT JOIN dispatch.detention_requests dr ON dr.detention_event_id = de.id AND dr.operating_company_id = de.operating_company_id")],
 ["billing",source.includes("LEFT JOIN accounting.invoices i")&&source.includes("invoice_display_id")],
 ["labels",source.includes("l.load_number")&&source.includes("c.customer_name")],
 ["drills",c.includes('entityKind: "load"')&&c.includes('entityKind: "customer"')&&c.includes('entityKind: "invoice"')],
 ["no stub",!source.includes('status: "stub"')&&!source.includes("Phase 4")],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){const m=b.replace("dr.operating_company_id = de.operating_company_id","dr.operating_company_id = l.customer_id");if(!failures(m).includes("lineage"))process.exit(1);console.log("verify-reports-detention-claims-connectivity selftest PASS — request-scope mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-reports-detention-claims-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-reports-detention-claims-connectivity PASS — events→requests→invoice with scoped labels/drills");
