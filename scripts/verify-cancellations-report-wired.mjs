#!/usr/bin/env node
// Guard (GAP-10): the load cancellations analytics report stays wired end-to-end — backend route
// registered + per-entity scoped, frontend page routed + linked in the Reports sub-nav, and the page
// renders all four groupings (reason / driver / customer / date). Additive report; locks it from
// silently disappearing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-cancellations-report-wired: ${m}`); process.exit(1); };
const read = (p) => readFileSync(join(root, p), "utf8");

// Backend: route exists, per-entity scoped, queries the real cancellations table.
const route = read("apps/backend/src/dispatch/cancellations-report.routes.ts");
if (!/\/api\/v1\/dispatch\/cancellations-report/.test(route)) fail("backend route path missing");
if (!/withCompanyScope/.test(route)) fail("route must use withCompanyScope (per-entity isolation)");
if (!/FROM dispatch\.load_cancellations/.test(route)) fail("route must read dispatch.load_cancellations");
for (const g of ["by_reason", "by_driver", "by_customer", "by_date"]) {
  if (!route.includes(`${g}:`)) fail(`route response missing grouping ${g}`);
}
const index = read("apps/backend/src/index.ts");
if (!/registerCancellationsReportRoutes\(app\)/.test(index)) fail("route not registered in index.ts");

// Frontend: page routed + sub-nav link + renders the four groupings.
const manifest = read("apps/frontend/src/routes/manifest.tsx");
if (!/path="\/reports\/cancellations"/.test(manifest)) fail("/reports/cancellations route missing in manifest");
if (!/<CancellationsReportPage\b/.test(manifest)) fail("CancellationsReportPage not mounted in manifest");
const subnav = read("apps/frontend/src/pages/reports/ReportsSubNav.tsx");
if (!/href: "\/reports\/cancellations"/.test(subnav)) fail("Cancellations link missing from Reports sub-nav");
const page = read("apps/frontend/src/pages/reports/CancellationsReportPage.tsx");
for (const [title, prop] of [["By reason", "by_reason"], ["By driver", "by_driver"], ["By customer", "by_customer"], ["By date", "by_date"]]) {
  if (!page.includes(`title="${title}"`) || !page.includes(`data?.${prop}`)) fail(`page must render the "${title}" grouping`);
}

console.log("PASS verify-cancellations-report-wired");
