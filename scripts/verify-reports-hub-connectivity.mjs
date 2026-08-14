#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^(home\\.hub|subnav\\.(category_hub|run_report))$","task":"VERTICAL-CONNECTIVITY-REPORTS-HUB"} */
import fs from "node:fs";
const hub=fs.readFileSync("apps/frontend/src/pages/reports/ReportsHub.tsx","utf8");
const nav=fs.readFileSync("apps/frontend/src/pages/reports/ReportsSubNav.tsx","utf8");
const api=fs.readFileSync("apps/backend/src/reports/categories/routes.ts","utf8");
const catalog=fs.readFileSync("apps/backend/src/reports/categories/category-catalog.ts","utf8");
const manifest=fs.readFileSync("apps/frontend/src/routes/manifest.tsx","utf8");
const failures=(h=hub)=>[
 ["hub fetches authenticated registry",h.includes('apiRequest<{ categories: CatalogCategory[] }>("/api/reports/categories/catalog")')],
 ["backend route authenticated",api.includes('app.get("/api/reports/categories/catalog"')&&api.includes("requireAuth(req, reply)")],
 ["registry is canonical code definition",catalog.includes("export const REPORT_CATEGORIES")&&catalog.includes("allCatalogReportIds")],
 ["hub renders returned report routes",h.includes("category.reports.map")&&h.includes("route={report.route}")],
 ["hub category EntityLink",h.includes('kind="report_category"')&&h.includes("id={category.id}")],
 ["hub route mounted",manifest.includes('path="/reports/hub"')],
 ["category subnav",nav.includes('{ label: "Category hub", href: "/reports/hub" }')],
 ["run-report flyout",nav.includes('{ label: "Run report", href: "/reports/hub", children: flattenReportRunLinks() }')],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){if(!failures(hub.replace("/api/reports/categories/catalog","/api/reports/categories/missing")).includes("hub fetches authenticated registry"))process.exit(1);console.log("verify-reports-hub-connectivity selftest PASS — registry path mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-reports-hub-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-reports-hub-connectivity PASS — hub and both subnav leaves consume authenticated canonical registry");
