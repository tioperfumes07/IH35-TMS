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
  const rowMaps = source.card.match(/\{rows\.map\(\(row\) =>/g) ?? [];
  return [
    ["backend exact total", route.includes("COUNT(*) OVER()::int AS total_count") && route.includes("total_count: Number(res.rows[0]?.total_count ?? 0)")],
    ["missing-relation response shape", route.includes('return { rows: [], total_count: 0 }')],
    ["typed API total", source.api.includes("rows: DtcAutoWorkOrderRow[]; total_count: number")],
    ["server page request", source.card.includes('["maintenance", "dtc-auto-wos", operatingCompanyId, page]') && source.card.includes("{ limit: pageSize, offset: page * pageSize }")],
    ["shared server-page rows", rowMaps.length === 2 && source.card.includes("const totalCount = query.data?.total_count ?? rows.length")],
    ["exact range math", source.card.includes('const range = totalCount === 0 ? "0 of 0"') && source.card.includes("Math.min((page + 1) * pageSize, totalCount)")],
    ["compact exact range", source.card.includes('pager("dtc-auto-work-orders-compact-range")')],
    ["full exact range", source.card.includes('pager("dtc-auto-work-orders-range")')],
    ["GET failure is explicit and retryable", source.card.includes("if (query.isError)") && source.card.includes("Couldn't load DTC auto-created work orders") && source.card.includes("onRetry={() => void query.refetch()}")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: mutateDtcRoute(live.route, "COUNT(*) OVER()::int AS total_count", "50 AS hidden_count") },
    { ...live, route: mutateDtcRoute(live.route, 'return { rows: [], total_count: 0 }', "return []") },
    { ...live, api: live.api.replace("rows: DtcAutoWorkOrderRow[]; total_count: number", "rows: DtcAutoWorkOrderRow[]") },
    { ...live, card: live.card.replace("{ limit: pageSize, offset: page * pageSize }", "{ limit: pageSize, offset: 0 }") },
    { ...live, card: live.card.replace("{rows.map((row) =>", "{rows_REMOVED.map((row) =>") },
    { ...live, card: live.card.replace('const range = totalCount === 0 ? "0 of 0"', 'const range = "unknown"') },
    { ...live, card: live.card.replace('pager("dtc-auto-work-orders-compact-range")', "null") },
    { ...live, card: live.card.replace('pager("dtc-auto-work-orders-range")', "null") },
    { ...live, card: live.card.replace("if (query.isError)", "if (false)") },
    { ...live, card: live.card.replace("onRetry={() => void query.refetch()}", "onRetry={undefined}") },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-dtc-auto-work-orders-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-dtc-auto-work-orders-range SELFTEST PASS — 10/10 mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-dtc-auto-work-orders-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-dtc-auto-work-orders-range PASS — DTC reverse card exposes exact totals and retryable GET failures");
