#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^runner\.dot_audit_pack$","task":"VERTICAL-CONNECTIVITY-REPORTS-DOT-AUDIT-PACK"} */
import fs from "node:fs";
const config=fs.readFileSync("apps/frontend/src/pages/reports/runners/runner-config.ts","utf8");
const runner=fs.readFileSync("apps/frontend/src/pages/reports/ReportsRunner.tsx","utf8");
const table=fs.readFileSync("apps/frontend/src/pages/reports/runners/RunnerTable.tsx","utf8");
const library=fs.readFileSync("apps/backend/src/reports/shared.ts","utf8");
const source=fs.readFileSync("apps/backend/src/routes/safety/dot-inspections.ts","utf8");
const safetyReports=fs.readFileSync("apps/frontend/src/pages/safety/reports/SafetyReportsPage.tsx","utf8");
const failures=(s=source)=>[
 ["real library registration",library.includes('id: "dot-audit-pack"')&&library.includes('status: "real"')],
 ["canonical runner endpoint",config.includes('"dot-audit-pack": {')&&config.includes('apiPath: "/api/v1/safety/dot-inspections"')],
 ["date range forwarded",runner.includes('reportId === "dot-audit-pack"')&&runner.includes('q.set("from"')&&runner.includes('q.set("to"')],
 ["canonical response normalized",runner.includes('payload.dot_inspections ?? []')],
 ["company membership scope",s.includes("assertCompanyMembership(userId, companyId)")&&s.includes("di.operating_company_id = $1::uuid")],
 ["date range server-filtered",s.includes("di.inspection_date >=")&&s.includes("di.inspection_date <=")],
 ["voided inspections excluded",s.includes("AND di.voided_at IS NULL")],
 ["human labels",s.includes("AS driver_name")&&s.includes("u.unit_number AS unit_number")&&s.includes("work_order_display_id")],
 ["forward drill links",config.includes('entityKind: "work_order"')&&table.includes("<EntityLink kind={column.entityKind}")],
 ["fake xlsx remains unused",safetyReports.includes("hardcoded stub workbook")],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const mutated=source.replace("AND di.voided_at IS NULL","AND di.voided_at IS NOT NULL");if(!failures(mutated).includes("voided inspections excluded"))process.exit(1);console.log("verify-reports-dot-audit-pack-connectivity selftest PASS — void-scope mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-reports-dot-audit-pack-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-reports-dot-audit-pack-connectivity PASS — scoped inspection ledger→CSV runner+entity drills; fake XLSX unused");
