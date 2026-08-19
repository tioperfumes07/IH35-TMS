#!/usr/bin/env node
/** DTC auto-WO reverse card must expose the exact count behind its compact list. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  card: fs.readFileSync("apps/frontend/src/pages/maintenance/components/DtcAutoWorkOrdersCard.tsx", "utf8"),
};

function dtcRoute(source) {
  const start = source.indexOf('app.get("/api/v1/maintenance/dashboard/dtc-auto-work-orders"');
  const end = source.indexOf('app.get("/api/v1/maintenance/fleet-table/kpis"', start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function mutateDtcRoute(source, from, to) {
  const segment = dtcRoute(source);
  return source.replace(segment, segment.replace(from, to));
}

function failures(source = live) {
  const route = dtcRoute(source.route);
  return [
    ["backend exact total", route.includes("COUNT(*) OVER()::int AS total_count") && route.includes("total_count: Number(res.rows[0]?.total_count ?? 0)")],
    ["missing-relation response shape", route.includes('return { rows: [], total_count: 0 }')],
    ["typed API total", source.api.includes("rows: DtcAutoWorkOrderRow[]; total_count: number")],
    ["shared visible rows", source.card.includes("const visibleRows = rows.slice(0, 10)") && source.card.includes("const totalCount = query.data?.total_count ?? rows.length")],
    ["compact exact range", source.card.includes('data-testid="dtc-auto-work-orders-compact-range"') && source.card.includes("Showing {visibleRows.length} of {totalCount} open DTC work orders")],
    ["full exact range", source.card.includes('data-testid="dtc-auto-work-orders-range"') && source.card.includes("totalCount > visibleRows.length")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: mutateDtcRoute(live.route, "COUNT(*) OVER()::int AS total_count", "50 AS hidden_count") },
    { ...live, route: mutateDtcRoute(live.route, 'return { rows: [], total_count: 0 }', "return []") },
    { ...live, api: live.api.replace("rows: DtcAutoWorkOrderRow[]; total_count: number", "rows: DtcAutoWorkOrderRow[]") },
    { ...live, card: live.card.replace("const visibleRows = rows.slice(0, 10)", "const visibleRows = rows") },
    { ...live, card: live.card.replace('data-testid="dtc-auto-work-orders-compact-range"', 'data-testid="missing-range"') },
    { ...live, card: live.card.replace('data-testid="dtc-auto-work-orders-range"', 'data-testid="missing-range"') },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-dtc-auto-work-orders-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-dtc-auto-work-orders-range SELFTEST PASS — 6/6 mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-dtc-auto-work-orders-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-dtc-auto-work-orders-range PASS — compact and full DTC reverse cards expose exact totals");
