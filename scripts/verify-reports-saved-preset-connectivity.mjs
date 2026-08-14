#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^runner\.saved_(owner_pack|quarter_close)$","task":"VERTICAL-CONNECTIVITY-REPORTS-SAVED-PRESETS"} */
import fs from "node:fs";
const runner=fs.readFileSync("apps/frontend/src/pages/reports/ReportsRunner.tsx","utf8");
const page=fs.readFileSync("apps/frontend/src/pages/reports/ScheduledReportsPage.tsx","utf8");
const api=fs.readFileSync("apps/frontend/src/api/scheduled-reports.ts","utf8");
const backend=fs.readFileSync("apps/backend/src/scheduled-reports/scheduled-reports.routes.ts","utf8");
const manifest=fs.readFileSync("apps/frontend/src/routes/manifest.tsx","utf8");
const failures=(p=page)=>[
 ["owner preset alias",runner.includes('"saved-owner-pack": "/reports/scheduled?preset=owner-weekly"')],
 ["quarter preset alias",runner.includes('"saved-quarter-close": "/reports/scheduled?preset=quarter-close"')],
 ["scheduled route mounted",manifest.includes('path="/reports/scheduled"')],
 ["preset registry",p.includes("const REPORT_PRESETS")&&p.includes('"owner-weekly"')&&p.includes('"quarter-close"')],
 ["real row filtering",p.includes("allRows.filter((row) => preset.reportIds.has(row.report_id))")],
 ["honest preset empty",p.includes("No ${preset.title.toLowerCase()} schedules exist for this company.")],
 ["canonical scoped reader",api.includes('withCompany("/api/v1/scheduled-reports"')&&backend.includes("operating_company_id = $1::uuid")],
 ["owner IDs",p.includes('"dispatch-board"')&&p.includes('"maintenance-open-wos"')],
 ["close IDs",p.includes('"ifta-quarterly-state"')&&p.includes('"settlements-ready"')],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const mutated=page.replace("preset.reportIds.has(row.report_id)","true");if(!failures(mutated).includes("real row filtering"))process.exit(1);console.log("verify-reports-saved-preset-connectivity selftest PASS — filter mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-reports-saved-preset-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-reports-saved-preset-connectivity PASS — two legacy doors filter real company schedules; empty stays honest");
