#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "docs/specs/fuel/FUEL-PLANNER-SOURCE-AVAILABILITY-CONTRACTS.json";
const LABEL = "verify-fuel-planner-source-availability";

function loadFiles() {
  if (!fs.existsSync(path.join(ROOT, REGISTRY))) throw new Error(`missing registry: ${REGISTRY}`);
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRY), "utf8"));
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) throw new Error("registry contracts must be non-empty");
  const files = {};
  for (const contract of registry.contracts) {
    for (const key of ["backend_file", "api_file", "ui_file"]) {
      const rel = contract[key];
      if (!rel || !fs.existsSync(path.join(ROOT, rel))) throw new Error(`${contract.id ?? "unknown"}: missing ${key} ${rel ?? ""}`);
      files[rel] ??= fs.readFileSync(path.join(ROOT, rel), "utf8");
    }
  }
  return { registry, files };
}

function inspect({ registry, files }) {
  const errors = [];
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) return ["registry contracts must be non-empty"];
  const ids = new Set();
  for (const contract of registry.contracts) {
    if (!contract.id || ids.has(contract.id)) errors.push(`missing/duplicate contract id: ${contract.id ?? ""}`);
    ids.add(contract.id);
    if (!/^fuel\.[a-z_]+$/.test(contract.canonical_relation ?? "")) errors.push(`${contract.id}: invalid canonical_relation`);
    for (const [fileKey, tokenKey] of [["backend_file", "backend_tokens"], ["api_file", "api_tokens"], ["ui_file", "ui_tokens"]]) {
      const source = files[contract[fileKey]];
      const tokens = contract[tokenKey];
      if (!Array.isArray(tokens) || tokens.length === 0) {
        errors.push(`${contract.id}: ${tokenKey} must be non-empty`);
        continue;
      }
      for (const token of tokens) if (!source?.includes(token)) errors.push(`${contract.id}: ${contract[fileKey]} missing ${token}`);
    }
  }
  const ui = files["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx"] ?? "";
  const backend = files["apps/backend/src/fuel/planner.routes.ts"] ?? "";
  const forbidden = [
    [ui, "fleet_pct_followed ?? 0"],
    [ui, "fleet_total_recommendations ?? 0"],
    [ui, "fleet_savings_ytd ?? 0"],
    [ui, "fleet_lost_savings_ytd ?? 0"],
    [backend, "return { routes: [], total_count: 0, source_available: false }"]
  ];
  for (const [source, token] of forbidden) if (source.includes(token)) errors.push(`false-zero fallback present: ${token}`);
  return errors;
}

function selftest() {
  const good = loadFiles();
  if (inspect(good).length) throw new Error(`good fixture rejected: ${inspect(good).join("; ")}`);
  const planner = "apps/backend/src/fuel/planner.routes.ts";
  const ui = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";
  const mutations = [
    ["empty registry", { registry: { ...good.registry, contracts: [] }, files: good.files }],
    ["route source check", { registry: good.registry, files: { ...good.files, [planner]: good.files[planner].replaceAll('hasRelation(client, "fuel.route_recommendations")', "false") } }],
    ["relay source check", { registry: good.registry, files: { ...good.files, [planner]: good.files[planner].replaceAll('hasRelation(client, "fuel.relay_matches")', "false") } }],
    ["backend null honesty", { registry: good.registry, files: { ...good.files, [planner]: good.files[planner].replace("active_plans: plannerSourceAvailable ? Number(activeRes.rows[0]?.count ?? 0) : null", "active_plans: Number(activeRes.rows[0]?.count ?? 0)") } }],
    ["active route false zero", { registry: good.registry, files: { ...good.files, [planner]: good.files[planner].replace("return { routes: [], total_count: null, source_available: false }", "return { routes: [], total_count: 0, source_available: false }") } }],
    ["compliance UI availability", { registry: good.registry, files: { ...good.files, [ui]: good.files[ui].replaceAll("sourceAvailable={Boolean(complianceQuery.data?.source_available)}", "sourceAvailable={true}") } }],
    ["savings false zero", { registry: good.registry, files: { ...good.files, [ui]: good.files[ui].replaceAll("fleetSavings={savingsQuery.data?.fleet_savings_ytd ?? null}", "fleetSavings={Number(savingsQuery.data?.fleet_savings_ytd ?? 0)}") } }]
  ];
  for (const [name, fixture] of mutations) if (inspect(fixture).length === 0) throw new Error(`mutation escaped: ${name}`);
  console.log(`${LABEL}: selftest PASS (${mutations.length}/${mutations.length})`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  try {
    const errors = inspect(loadFiles());
    if (errors.length) {
      console.error(`${LABEL}: FAIL`);
      errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — registry binds every Fuel planner fallback source to explicit unavailable UI`);
  } catch (error) {
    console.error(`${LABEL}: FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
