#!/usr/bin/env node
/**
 * verify-profitability-hub-wired — fill-not-shell: Profitability hub tabs + KPI call real engines.
 * Usage: node scripts/verify-profitability-hub-wired.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-profitability-hub-wired";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * The cancelled exclusion on alias `a`: the inline `a.status::text <> 'cancelled'`, or the canonical mount
 * ${canonicalNotCancelledLoadClause("a")} (verify-one-canonical-active-load-set forbids the inline form outside the canonical
 * module). A mount counts ONLY while the canonical helper still emits that exact predicate — re-read every run.
 */
export function notCancelledCount(src, a, canonSrc) {
  const inline = (src.match(new RegExp(`\\b${a}\\.status::text\\s*<>\\s*'cancelled'`, "g")) || []).length;
  const body = (canonSrc.match(/export function canonicalNotCancelledLoadClause\([\s\S]*?\n}/) || [""])[0];
  const helperEmits = body.includes("`${alias}.status::text <> 'cancelled'`");
  const mounts = helperEmits ? (src.match(new RegExp(`\\$\\{canonicalNotCancelledLoadClause\\("${a}"\\)\\}`, "g")) || []).length : 0;
  return inline + mounts;
}

export function verdict(files) {
  const problems = [];
  if (!files.manifest.includes('path="/profitability"') || !files.manifest.includes("ProfitabilityHubPage")) {
    problems.push("routes/manifest.tsx must mount ProfitabilityHubPage at /profitability");
  }
  if (!files.index.includes("registerEquipmentTypeProfitabilityRoutes")) {
    problems.push("reports/index.ts must register equipment-type-profitability routes");
  }
  if (!files.route.includes("/api/v1/reports/equipment-type-profitability")) {
    problems.push("equipment-type-profitability.routes.ts must declare the GET path");
  }
  if (!files.api.includes("getEquipmentTypeProfitability")) {
    problems.push("api/reports.ts must export getEquipmentTypeProfitability");
  }
  for (const [name, src, needle, requireBoard] of [
    ["ByLaneView", files.lane, "getLaneProfitability", true],
    ["ByCustomerView", files.customer, "getCustomerProfitability", true],
    ["ByTypeView", files.type, "getEquipmentTypeProfitability", true],
    ["ByLoadView", files.load, "getTripProfitability", true],
    ["KpiStrip", files.kpi, "getLaneProfitability", false],
  ]) {
    if (!src.includes(needle)) problems.push(`${name} must call ${needle}`);
    if (/const rows:\s*\w+\[\]\s*=\s*\[\]/.test(src) || /const ROWS\s*=\s*\[\]/.test(src)) {
      problems.push(`${name} still has an empty static rows stub`);
    }
    if (requireBoard && !src.includes("BoardSection")) problems.push(`${name} must use BoardSection`);
  }
  if (files.kpi.includes("unavailable={NO_FEED}") || files.kpi.includes("Profitability engine feed is not connected")) {
    problems.push("KpiStrip must not keep the unavailable NO_FEED stub");
  }
  for (const [name, src] of [
    ["ByLaneView", files.lane],
    ["ByCustomerView", files.customer],
    ["ByTypeView", files.type],
    ["ByLoadView", files.load],
    ["KpiStrip", files.kpi],
  ]) {
    if (!src.includes("filters.equipmentType")) {
      problems.push(`${name} queryKey/filter must include filters.equipmentType`);
    }
  }
  for (const [name, src] of [
    ["ByLaneView", files.lane],
    ["ByCustomerView", files.customer],
    ["ByLoadView", files.load],
  ]) {
    // Codex batch61 — never early-return to ByTypeView before hooks; keep each tab's grouping.
    if (/if\s*\(\s*filters\.equipmentType\s*\)[\s\S]{0,120}return\s*<ByTypeView/.test(src)) {
      problems.push(`${name} must not early-return ByTypeView when equipmentType is set (hooks + retain grouping)`);
    }
    if (!src.includes("equipment_type: filters.equipmentType") && !src.includes("equipment_type: filters.equipmentType,")) {
      problems.push(`${name} must pass equipment_type: filters.equipmentType into its report engine`);
    }
    const hookIdx = src.indexOf("useQuery(");
    const earlyEquip = src.search(/if\s*\(\s*filters\.equipmentType\s*\)/);
    if (hookIdx >= 0 && earlyEquip >= 0 && earlyEquip < hookIdx) {
      problems.push(`${name} must not branch on equipmentType before useQuery (rules-of-hooks)`);
    }
  }
  if (!files.type.includes("matchesEquipmentType")) {
    problems.push("ByTypeView must apply matchesEquipmentType local filter");
  }
  const aliases = read("apps/backend/src/reports/equipment-type-aliases.ts");
  if (!aliases.includes("loadMatchesEquipmentSql") || !aliases.includes("resolveEquipmentTypeAliases")) {
    problems.push("equipment-type-aliases.ts must export resolveEquipmentTypeAliases + loadMatchesEquipmentSql");
  }
  const customerRoute = read("apps/backend/src/reports/customer-profitability.routes.ts");
  if (!customerRoute.includes("equipment_type") || !customerRoute.includes("loadMatchesEquipmentSql")) {
    problems.push("customer-profitability must accept equipment_type and filter loads via loadMatchesEquipmentSql");
  }
  const laneRoute = read("apps/backend/src/reports/lane-profitability.routes.ts");
  if (!laneRoute.includes("equipment_type") || !laneRoute.includes("computeLaneProfitability")) {
    problems.push("lane-profitability must accept equipment_type and live-compute when set");
  }
  const tripRoute = read("apps/backend/src/dispatch/load-profitability.routes.ts");
  if (!tripRoute.includes("equipment_type") || !tripRoute.includes("equipmentAliases")) {
    problems.push("trip-profitability must accept equipment_type");
  }
  if (!files.kpi.includes("getEquipmentTypeProfitability")) {
    problems.push("KpiStrip must read equipment-type engine when equipment filter is set");
  }
  // Codex batch54 — void/voided driver bills must not inflate By Type direct cost.
  // Codex batch57 — plant each bills-CTE predicate independently (loads.voided_at must not mask bills).
  const billsCte = (files.route.match(/bills\s+AS\s*\([\s\S]*?\)\s*,\s*fuel\s+AS/i) || [])[0] || "";
  if (!/\bdb\.voided_at\s+IS\s+NULL/.test(billsCte)) {
    problems.push("equipment-type-profitability bills CTE must require db.voided_at IS NULL");
  }
  if (!/\bdb\.status\s+NOT\s+IN\s*\(\s*'void'\s*,\s*'voided'\s*\)/.test(billsCte)) {
    problems.push("equipment-type-profitability bills CTE must require db.status NOT IN ('void','voided')");
  }

  if (!/voided_at\s+IS\s+NULL/.test(customerRoute) || !/status\s+NOT\s+IN\s*\(\s*'void'\s*,\s*'voided'\s*\)/.test(customerRoute)) {
    problems.push("customer-profitability cost query must exclude void/voided driver bills");
  }
  if ((customerRoute.match(/l\.voided_at\s+IS\s+NULL/g) || []).length < 3) {
    problems.push("customer-profitability load queries must exclude voided loads (rev/prev/cost)");
  }
  const laneSvc = read("apps/backend/src/reports/lane-profitability.service.ts");
  const canonSrc = read("apps/backend/src/dispatch/canonical-active-load-set.ts");
  if ((laneSvc.match(/voided_at\s+IS\s+NULL/g) || []).length < 2 || (laneSvc.match(/status\s+NOT\s+IN\s*\(\s*'void'\s*,\s*'voided'\s*\)/g) || []).length < 2) {
    problems.push("lane-profitability pay CTEs must exclude void/voided driver bills (both aggregations)");
  }
  // Codex batch63 — lane load_scope must match equipment-type live population (no cancelled/voided loads).
  if ((laneSvc.match(/l\.voided_at\s+IS\s+NULL/g) || []).length < 2 || notCancelledCount(laneSvc, "l", canonSrc) < 2) {
    problems.push("lane-profitability load_scope must exclude voided/cancelled loads (compute + detail)");
  }
  // Sibling of batch63 — trip/By-Load report joins must exclude voided/cancelled loads.
  const tripSvc = read("apps/backend/src/dispatch/load-profitability.service.ts");
  if ((tripSvc.match(/l\.voided_at\s+IS\s+NULL/g) || []).length < 2 || notCancelledCount(tripSvc, "l", canonSrc) < 2) {
    problems.push("trip-profitability load joins must exclude voided/cancelled loads (rollup + northbound)");
  }
  if ((tripSvc.match(/lx\.voided_at\s+IS\s+NULL/g) || []).length < 1 || notCancelledCount(tripSvc, "lx", canonSrc) < 1) {
    problems.push("trip-profitability equipment filter must exclude voided/cancelled loads");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = {
    manifest: 'path="/profitability" ProfitabilityHubPage',
    index: "registerEquipmentTypeProfitabilityRoutes(app)",
    route: "app.get(\"/api/v1/reports/equipment-type-profitability\"\nbills AS (\nAND db.voided_at IS NULL\nAND db.status NOT IN ('void', 'voided')\n),\nfuel AS",
    api: "export async function getEquipmentTypeProfitability",
    lane: "getLaneProfitability\nBoardSection\nfilters.equipmentType\nequipment_type: filters.equipmentType\nuseQuery(",
    customer: "getCustomerProfitability\nBoardSection\nfilters.equipmentType\nequipment_type: filters.equipmentType\nuseQuery(",
    type: "getEquipmentTypeProfitability\nBoardSection\nfilters.equipmentType\nmatchesEquipmentType",
    load: "getTripProfitability\nBoardSection\nfilters.equipmentType\nequipment_type: filters.equipmentType\nuseQuery(",
    kpi: "getLaneProfitability\nDrillKpiCard\nfilters.equipmentType\ngetEquipmentTypeProfitability",
  };
  const cases = [
    ["clean passes", verdict(good).length === 0],
    ["empty stub fails", verdict({ ...good, lane: "const rows: X[] = []; BoardSection" }).some((p) => p.includes("empty static"))],
    ["missing register fails", verdict({ ...good, index: "" }).some((p) => p.includes("register"))],
    ["missing dead-bill filter fails", verdict({ ...good, route: 'app.get("/api/v1/reports/equipment-type-profitability"\nbills AS (\nSELECT 1\n),\nfuel AS' }).some((p) => p.includes("bills CTE"))],
    ["loads.voided_at must not mask bills", verdict({ ...good, route: 'app.get("/api/v1/reports/equipment-type-profitability"\nbills AS (\nSELECT 1 WHERE l.voided_at IS NULL\n),\nfuel AS' }).some((p) => p.includes("db.voided_at"))],
    ["missing route mount fails", verdict({ ...good, manifest: "" }).some((p) => p.includes("/profitability"))],
    ["missing equipmentType key fails", verdict({ ...good, lane: "getLaneProfitability\nBoardSection" }).some((p) => p.includes("equipmentType"))],
    ["ByType early-return fails", verdict({ ...good, lane: "getLaneProfitability\nBoardSection\nfilters.equipmentType\nif (filters.equipmentType) {\n  return <ByTypeView filters={filters} />;\n}\nuseQuery(" }).some((p) => p.includes("early-return") || p.includes("rules-of-hooks"))],
    ["canonical not-cancelled mount counts", notCancelledCount('AND ${canonicalNotCancelledLoadClause("l")} AND ${canonicalNotCancelledLoadClause("l")}', "l", read("apps/backend/src/dispatch/canonical-active-load-set.ts")) === 2],
    ["mount does not count once the helper stops excluding cancelled", notCancelledCount('AND ${canonicalNotCancelledLoadClause("l")}', "l", read("apps/backend/src/dispatch/canonical-active-load-set.ts").replace("`${alias}.status::text <> 'cancelled'`", "`TRUE`")) === 0],
    ["dropped exclusion counts zero", notCancelledCount("AND l.voided_at IS NULL", "l", read("apps/backend/src/dispatch/canonical-active-load-set.ts")) === 0],
    ["missing equipment_type param fails", verdict({ ...good, lane: "getLaneProfitability\nBoardSection\nfilters.equipmentType\nuseQuery(" }).some((p) => p.includes("equipment_type"))],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const files = {
  manifest: read("apps/frontend/src/routes/manifest.tsx"),
  index: read("apps/backend/src/reports/index.ts"),
  route: read("apps/backend/src/reports/equipment-type-profitability.routes.ts"),
  api: read("apps/frontend/src/api/reports.ts"),
  lane: read("apps/frontend/src/pages/profitability/ByLaneView.tsx"),
  customer: read("apps/frontend/src/pages/profitability/ByCustomerView.tsx"),
  type: read("apps/frontend/src/pages/profitability/ByTypeView.tsx"),
  load: read("apps/frontend/src/pages/profitability/ByLoadView.tsx"),
  kpi: read("apps/frontend/src/pages/profitability/KpiStrip.tsx"),
};
const problems = verdict(files);
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`${LABEL} FAIL`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Profitability hub tabs + KPI wired to live report engines`);
process.exit(0);
