#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "docs/specs/dispatch/PLANNER-GRID-CANONICAL-CONTRACTS.json";
const LABEL = "verify-planner-grid-canonical";

function load() {
  const registryPath = path.join(ROOT, REGISTRY);
  if (!fs.existsSync(registryPath)) throw new Error(`missing registry: ${REGISTRY}`);
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const paths = new Set();
  for (const contract of registry.source_contracts ?? []) paths.add(contract.file);
  for (const contract of registry.route_contracts ?? []) {
    paths.add(contract.entry_file);
    paths.add(contract.renderer_file);
  }
  const sources = {};
  for (const relative of paths) {
    const absolute = path.join(ROOT, relative ?? "");
    if (!relative || !fs.existsSync(absolute)) throw new Error(`missing governed file: ${relative ?? ""}`);
    sources[relative] = fs.readFileSync(absolute, "utf8");
  }
  return { registry, sources };
}

function trackRenderer(source) {
  const start = source.indexOf('className="pg-track"');
  const end = source.indexOf("{row.bars.map", start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function inspect({ registry, sources }) {
  const errors = [];
  if (!Array.isArray(registry.source_contracts) || registry.source_contracts.length !== 6) {
    errors.push("registry must contain the six source-verifiable A contracts (A1-A4, A6-A7)");
  }
  if (!Array.isArray(registry.route_contracts) || registry.route_contracts.length !== 5) {
    errors.push("registry must contain exactly five canonical planner routes");
  }

  const ids = new Set();
  for (const contract of registry.source_contracts ?? []) {
    if (!contract.id || ids.has(contract.id)) errors.push(`missing/duplicate source contract id: ${contract.id ?? ""}`);
    ids.add(contract.id);
    const source = sources[contract.file] ?? "";
    if (!Array.isArray(contract.required_tokens) || contract.required_tokens.length === 0) {
      errors.push(`${contract.id}: required_tokens must be non-empty`);
    }
    for (const token of contract.required_tokens ?? []) {
      if (!source.includes(token)) errors.push(`${contract.id}: missing ${token}`);
    }
    for (const token of contract.forbidden_tokens ?? []) {
      if (source.includes(token)) errors.push(`${contract.id}: forbidden ${token}`);
    }
  }

  const gridPath = registry.canonical_grid?.tsx;
  const grid = sources[gridPath] ?? "";
  const track = trackRenderer(grid);
  if (!track) errors.push("A5_TRACK_HAS_NO_AVAILABLE_TEXT: pg-track renderer not found");
  else if (/\bAvailable\b/.test(track)) errors.push("A5_TRACK_HAS_NO_AVAILABLE_TEXT: Available text rendered inside pg-track");

  const routes = new Set();
  for (const contract of registry.route_contracts ?? []) {
    if (!contract.route || routes.has(contract.route)) errors.push(`missing/duplicate route: ${contract.route ?? ""}`);
    routes.add(contract.route);
    const entry = sources[contract.entry_file] ?? "";
    const renderer = sources[contract.renderer_file] ?? "";
    for (const token of contract.entry_tokens ?? []) {
      if (!entry.includes(token)) errors.push(`${contract.route}: entry missing ${token}`);
    }
    for (const token of contract.renderer_tokens ?? []) {
      if (!renderer.includes(token)) errors.push(`${contract.route}: renderer missing ${token}`);
    }
  }
  return errors;
}

function mutate(good, file, from, to) {
  const source = good.sources[file];
  if (!source?.includes(from)) throw new Error(`selftest anchor missing in ${file}: ${from}`);
  return { registry: good.registry, sources: { ...good.sources, [file]: source.replace(from, to) } };
}

export function selftestPlannerGridCanonical() {
  const good = load();
  const baseline = inspect(good);
  if (baseline.length) throw new Error(`good fixture rejected: ${baseline.join("; ")}`);
  const grid = good.registry.canonical_grid.tsx;
  const timeline = "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx";
  const mutations = [
    ["A1 gradient", mutate(good, grid, "repeating-linear-gradient(to right", "linear-gradient(to right")],
    ["A2 day width", mutate(good, grid, "PLANNER_DAY_PX = 52", "PLANNER_DAY_PX = 48")],
    ["A3 row height", mutate(good, grid, "PLANNER_ROW_PX = 34", "PLANNER_ROW_PX = 40")],
    ["A4 evidence hook", mutate(good, grid, "data-load-id={bar.loadId ?? bar.id}", "data-load-key={bar.loadId ?? bar.id}")],
    ["A5 Available in track", mutate(good, grid, "<TrackOverlays days={days}", '<span>Available</span><TrackOverlays days={days}')],
    ["A6 dwell label", mutate(good, grid, "<i>{w.label}</i>", "<i />")],
    ["A7 OOS sticky flush", mutate(good, timeline, 'className="mt-3" data-testid="planner-oos-group"', 'className="sticky mt-3" data-testid="planner-oos-group"')],
    ...good.registry.route_contracts.map((contract) => [
      `route ${contract.route}`,
      mutate(good, contract.renderer_file, contract.renderer_tokens[0], "LegacyPlannerGrid,"),
    ]),
    ["empty registry", { registry: { ...good.registry, source_contracts: [], route_contracts: [] }, sources: good.sources }],
  ];
  for (const [name, fixture] of mutations) {
    if (inspect(fixture).length === 0) throw new Error(`mutation escaped: ${name}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length}/${mutations.length})`);
}

export function verifyPlannerGridCanonical() {
  try {
    const errors = inspect(load());
    if (errors.length) {
      console.error(`${LABEL}: FAIL`);
      errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — A1-A3/A5-A7 source contracts and A4 evidence hook hold across 5 planner routes`);
  } catch (error) {
    console.error(`${LABEL}: FAIL — ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
  return true;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  if (process.argv.includes("--selftest")) selftestPlannerGridCanonical();
  else if (!verifyPlannerGridCanonical()) process.exit(1);
}
