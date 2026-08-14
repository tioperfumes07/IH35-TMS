#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^runner\.hos_violations$","task":"VERTICAL-CONNECTIVITY-REPORTS-HOS-VIOLATIONS"} */
import fs from "node:fs";
const config=fs.readFileSync("apps/frontend/src/pages/reports/runners/runner-config.ts","utf8");
const runner=fs.readFileSync("apps/frontend/src/pages/reports/ReportsRunner.tsx","utf8");
const table=fs.readFileSync("apps/frontend/src/pages/reports/runners/RunnerTable.tsx","utf8");
const library=fs.readFileSync("apps/backend/src/reports/shared.ts","utf8");
const source=fs.readFileSync("apps/backend/src/routes/safety/hos-violations.ts","utf8");
const failures=(s=source)=>[
 ["real library registration",library.includes('id: "hos-violations"')&&library.includes('status: "real"')],
 ["canonical runner endpoint",config.includes('"hos-violations": {')&&config.includes('apiPath: "/api/v1/safety/hos-violations"')],
 ["date range forwarded",runner.includes('reportId === "hos-violations"')&&runner.includes('`${String(values.to)}T23:59:59.999Z`')],
 ["canonical response normalized",runner.includes('payload.hos_violations ?? []')],
 ["company membership scope",s.includes("assertCompanyMembership(userId, companyId)")&&s.includes("operating_company_id = $1::uuid")],
 ["void filtering",s.includes('"voided_at IS NULL"')],
 ["human driver and load labels",s.includes("AS driver_name")&&s.includes("l.load_number AS related_load_number")],
 ["forward drill links",config.includes('entityKind: "driver"')&&config.includes('entityKind: "load"')&&table.includes("<EntityLink kind={column.entityKind}")],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const mutated=source.replace('"voided_at IS NULL"','"voided_at IS NOT NULL"');if(!failures(mutated).includes("void filtering"))process.exit(1);console.log("verify-reports-hos-violations-connectivity selftest PASS — void-filter mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-reports-hos-violations-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-reports-hos-violations-connectivity PASS — scoped safety source→runner→driver/load drill-through");
