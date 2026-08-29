#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity","reverse_link"],"leafRe":"^report\\.cancellations$","task":"LV-REPORTS-CANCELLATIONS-AGGREGATE-ENTITY-LINKS-INERT"} */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const route = read("apps/backend/src/dispatch/cancellations-report.routes.ts");
const analytics = read("apps/backend/src/dispatch/load-cancellations-analytics.routes.ts");
const index = read("apps/backend/src/index.ts");
const manifest = read("apps/frontend/src/routes/manifest.tsx");
const subnav = read("apps/frontend/src/pages/reports/ReportsSubNav.tsx");
const page = read("apps/frontend/src/pages/reports/CancellationsReportPage.tsx");

function failures(routeSource = route, pageSource = page, analyticsSource = analytics) {
  return [
    ["backend route path", /\/api\/v1\/dispatch\/cancellations-report/.test(routeSource)],
    ["company scope", routeSource.includes("withCompanyScope") && routeSource.includes("FROM dispatch.load_cancellations")],
    ["route registration", /registerCancellationsReportRoutes\(app\)/.test(index)],
    ["frontend mount", /path="\/reports\/cancellations"/.test(manifest) && /<CancellationsReportPage\b/.test(manifest)],
    ["subnav link", /href: "\/reports\/cancellations"/.test(subnav)],
    ["all four groupings", ["by_reason", "by_driver", "by_customer", "by_date"].every((value) => routeSource.includes(`${value}:`) && pageSource.includes(value))],
    ["driver canonical key lineage", routeSource.includes('by_driver: groupBy(rows, (r) => r.driver_id ?? "unassigned"')],
    ["report driver active company authorization", /driver_company_authorizations cancellation_report_driver_dca[\s\S]{0,360}cancellation_report_driver_dca\.company_id = lc\.operating_company_id[\s\S]{0,180}cancellation_report_driver_dca\.is_authorized = true[\s\S]{0,180}cancellation_report_driver_dca\.deactivated_at IS NULL/.test(routeSource)],
    ["analytics driver active company authorization", /driver_company_authorizations cancellation_analytics_driver_dca[\s\S]{0,360}cancellation_analytics_driver_dca\.company_id = lc\.operating_company_id[\s\S]{0,180}cancellation_analytics_driver_dca\.is_authorized = true[\s\S]{0,180}cancellation_analytics_driver_dca\.deactivated_at IS NULL/.test(analyticsSource)],
    ["report historical driver label fallback", /COALESCE\([\s\S]{0,220}mdata\.resolve_driver_label_same_company\(l\.assigned_primary_driver_id, lc\.operating_company_id\)[\s\S]{0,80}AS driver_name/.test(routeSource)],
    ["analytics historical driver label fallback", /COALESCE\([\s\S]{0,220}mdata\.resolve_driver_label_same_company\(l\.assigned_primary_driver_id, lc\.operating_company_id\)[\s\S]{0,80}AS driver_name/.test(analyticsSource)],
    ["analytics historical customer label fallback", /COALESCE\(c\.customer_name, mdata\.resolve_customer_label_same_company\(l\.customer_id, lc\.operating_company_id\)\) AS customer_name/.test(analyticsSource)],
    ["customer canonical key lineage", routeSource.includes('by_customer: groupBy(rows, (r) => r.customer_id ?? "unknown"')],
    ["driver typed mapping", pageSource.includes('prop: "by_driver" as const') && pageSource.includes('entityKind: "driver" as const')],
    ["customer typed mapping", pageSource.includes('prop: "by_customer" as const') && pageSource.includes('entityKind: "customer" as const')],
    // The renderer now wraps the label in entityLabel(row.label, row.key, noun) — honest, uuid-
    // shape-guarded — instead of passing raw row.label straight through, and additionally
    // withholds the EntityLink for an unresolved/tombstone label (isUnresolvedEntityTombstone).
    // Both are strictly stronger than the original literal ask. The sentinel is now written as its
    // De Morgan-equivalent early-return guard (`!entityKind || !UUID_KEY.test(row.key)` = bail
    // unless `entityKind && UUID_KEY.test(row.key)`), not the positive form — same logic, inverted
    // for the early-return style already used by the sibling `formatAsDate` branch above it.
    [
      "shared EntityLink renderer",
      pageSource.includes("<EntityLink kind={entityKind} id={row.key} label={row.label}") ||
        (pageSource.includes("<EntityLink kind={entityKind} id={row.key} label={label}") &&
          pageSource.includes("entityLabel(row.label, row.key, noun)")),
    ],
    [
      "sentinel safety",
      pageSource.includes("entityKind && UUID_KEY.test(row.key)") ||
        pageSource.includes("!entityKind || !UUID_KEY.test(row.key)"),
    ],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["driver canonical key lineage", route.replace("r.driver_id", "r.driver_name")],
    ["customer canonical key lineage", route.replace("r.customer_id", "r.customer_name")],
    ["driver typed mapping", page.replace('entityKind: "driver" as const', "entityKind: null")],
    ["customer typed mapping", page.replace('entityKind: "customer" as const', "entityKind: null")],
    ["shared EntityLink renderer", page.replace("<EntityLink kind={entityKind}", "<span data-kind={entityKind}")],
    ["sentinel safety", page.replace("!entityKind || !UUID_KEY.test(row.key)", "false")],
    ["report driver active company authorization", route.replace("cancellation_report_driver_dca.is_authorized = true", "cancellation_report_driver_dca.is_authorized = false")],
    ["analytics driver active company authorization", analytics.replace("cancellation_analytics_driver_dca.is_authorized = true", "cancellation_analytics_driver_dca.is_authorized = false")],
    ["report historical driver label fallback", route.replace("mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id, lc.operating_company_id)", "NULL")],
    ["analytics historical driver label fallback", analytics.replace("mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id, lc.operating_company_id)", "NULL")],
    ["analytics historical customer label fallback", analytics.replace("mdata.resolve_customer_label_same_company(l.customer_id, lc.operating_company_id)", "NULL")],
  ];
  for (const [expected, source] of mutations) {
    const problems = expected === "analytics driver active company authorization"
      ? failures(route, page, source)
      : expected.startsWith("analytics ")
        ? failures(route, page, source)
        : expected.includes("key lineage") || expected.startsWith("report ")
        ? failures(source, page, analytics)
        : failures(route, source, analytics);
    if (!problems.includes(expected)) throw new Error(`planted ${expected} defect escaped`);
  }
  console.log(`verify-cancellations-report-wired SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-cancellations-report-wired FAIL\n${missing.join("\n")}`);
  process.exit(1);
}
console.log("verify-cancellations-report-wired PASS — scoped cancellations plus canonical driver/customer aggregate drills");
