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
  if (!files.type.includes("matchesEquipmentType")) {
    problems.push("ByTypeView must apply matchesEquipmentType local filter");
  }
  if (!files.kpi.includes("getEquipmentTypeProfitability")) {
    problems.push("KpiStrip must read equipment-type engine when equipment filter is set");
  }
  // Codex batch54 — void/voided driver bills must not inflate By Type direct cost.
  if (!/voided_at\s+IS\s+NULL/.test(files.route) || !/status\s+NOT\s+IN\s*\(\s*'void'\s*,\s*'voided'\s*\)/.test(files.route)) {
    problems.push("equipment-type-profitability bills CTE must exclude void/voided driver bills");
  }

  const customerRoute = read("apps/backend/src/reports/customer-profitability.routes.ts");
  if (!/voided_at\s+IS\s+NULL/.test(customerRoute) || !/status\s+NOT\s+IN\s*\(\s*'void'\s*,\s*'voided'\s*\)/.test(customerRoute)) {
    problems.push("customer-profitability cost query must exclude void/voided driver bills");
  }
  const laneSvc = read("apps/backend/src/reports/lane-profitability.service.ts");
  if ((laneSvc.match(/voided_at\s+IS\s+NULL/g) || []).length < 2 || (laneSvc.match(/status\s+NOT\s+IN\s*\(\s*'void'\s*,\s*'voided'\s*\)/g) || []).length < 2) {
    problems.push("lane-profitability pay CTEs must exclude void/voided driver bills (both aggregations)");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = {
    manifest: 'path="/profitability" ProfitabilityHubPage',
    index: "registerEquipmentTypeProfitabilityRoutes(app)",
    route: "app.get(\"/api/v1/reports/equipment-type-profitability\"\nAND db.voided_at IS NULL\nAND db.status NOT IN ('void', 'voided')",
    api: "export async function getEquipmentTypeProfitability",
    lane: "getLaneProfitability\nBoardSection\nfilters.equipmentType",
    customer: "getCustomerProfitability\nBoardSection\nfilters.equipmentType",
    type: "getEquipmentTypeProfitability\nBoardSection\nfilters.equipmentType\nmatchesEquipmentType",
    load: "getTripProfitability\nBoardSection\nfilters.equipmentType",
    kpi: "getLaneProfitability\nDrillKpiCard\nfilters.equipmentType\ngetEquipmentTypeProfitability",
  };
  const cases = [
    ["clean passes", verdict(good).length === 0],
    ["empty stub fails", verdict({ ...good, lane: "const rows: X[] = []; BoardSection" }).some((p) => p.includes("empty static"))],
    ["missing register fails", verdict({ ...good, index: "" }).some((p) => p.includes("register"))],
    ["missing dead-bill filter fails", verdict({ ...good, route: 'app.get("/api/v1/reports/equipment-type-profitability"' }).some((p) => p.includes("void/voided"))],
    ["missing route mount fails", verdict({ ...good, manifest: "" }).some((p) => p.includes("/profitability"))],
    ["missing equipmentType key fails", verdict({ ...good, lane: "getLaneProfitability\nBoardSection" }).some((p) => p.includes("equipmentType"))],
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
