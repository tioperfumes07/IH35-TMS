#!/usr/bin/env node
/** DTC auto-WO reverse card must expose the exact count behind its compact list. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  card: fs.readFileSync("apps/frontend/src/pages/maintenance/components/DtcAutoWorkOrdersCard.tsx", "utf8"),
};

function failures(source = live) {
  return [
    ["backend exact total", source.route.includes("COUNT(*) OVER()::int AS total_count") && source.route.includes("total_count: Number(res.rows[0]?.total_count ?? 0)")],
    ["missing-relation response shape", source.route.includes('return { rows: [], total_count: 0 }')],
    ["typed API total", source.api.includes("rows: DtcAutoWorkOrderRow[]; total_count: number")],
    ["shared visible rows", source.card.includes("const visibleRows = rows.slice(0, 10)") && source.card.includes("const totalCount = query.data?.total_count ?? rows.length")],
    ["compact exact range", source.card.includes('data-testid="dtc-auto-work-orders-compact-range"') && source.card.includes("Showing {visibleRows.length} of {totalCount} open DTC work orders")],
    ["full exact range", source.card.includes('data-testid="dtc-auto-work-orders-range"') && source.card.includes("totalCount > visibleRows.length")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replace("COUNT(*) OVER()::int AS total_count", "50 AS hidden_count") },
    { ...live, route: live.route.replace('return { rows: [], total_count: 0 }', "return []") },
    { ...live, api: live.api.replace("; total_count: number", "") },
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
