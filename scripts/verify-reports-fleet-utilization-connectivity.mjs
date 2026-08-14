#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^runner\.fleet_utilization$","task":"VERTICAL-CONNECTIVITY-REPORTS-FLEET-UTILIZATION"} */
import fs from "node:fs";
const config=fs.readFileSync("apps/frontend/src/pages/reports/runners/runner-config.ts","utf8");
const runner=fs.readFileSync("apps/frontend/src/pages/reports/ReportsRunner.tsx","utf8");
const library=fs.readFileSync("apps/backend/src/reports/shared.ts","utf8");
const route=fs.readFileSync("apps/backend/src/home/home-widgets.routes.ts","utf8");
const catalog=fs.readFileSync("apps/backend/src/reports/categories/category-catalog.ts","utf8");
const failures=(r=route)=>[
 ["catalog door",catalog.includes('id: "fleet-utilization"')&&catalog.includes('route: "/reports/run/fleet-utilization"')],
 ["real library registration",library.includes('id: "fleet-utilization"')&&library.includes('name: "Fleet utilization"')],
 ["runner canonical endpoint",config.includes('"fleet-utilization": {')&&config.includes('apiPath: "/api/v1/home/fleet-utilization"')],
 ["runner object response",runner.includes('reportId === "fleet-utilization"')&&runner.includes("return [payload as Record<string, unknown>]" )],
 ["authenticated company scope",r.includes('app.get("/api/v1/home/fleet-utilization"')&&r.includes("withCompanyScope(user.uuid, parsed.data.operating_company_id")],
 ["canonical unit and load sources",r.includes("FROM mdata.units u")&&r.includes("FROM mdata.loads")&&r.includes("assigned_unit_id")],
 ["failure is loud",r.includes('"fleet utilization query failed"')&&r.includes("throw error")&&!r.includes("catch {\n        return { active_units: 0, total_units: 0, percentage: 0 };")],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const mutated=route.replace("throw error","return { active_units: 0, total_units: 0, percentage: 0 }");if(!failures(mutated).includes("failure is loud"))process.exit(1);console.log("verify-reports-fleet-utilization-connectivity selftest PASS — false-zero mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-reports-fleet-utilization-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-reports-fleet-utilization-connectivity PASS — catalog→runner→company-scoped units/loads; failures stay loud");
