#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "docs/specs/fleet/FLEET-TRIP-COST-SCOPE-LIFECYCLE-CONTRACTS.json";
const LABEL = "verify-fleet-trip-cost-scope-lifecycle";

function load() {
  const registryPath = path.join(ROOT, REGISTRY);
  if (!fs.existsSync(registryPath)) throw new Error(`missing registry: ${REGISTRY}`);
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) throw new Error("registry contracts must be non-empty");
  const sources = {};
  for (const contract of registry.contracts) {
    const absolute = path.join(ROOT, contract.file ?? "");
    if (!contract.file || !fs.existsSync(absolute)) throw new Error(`${contract.id ?? "unknown"}: missing file`);
    sources[contract.file] = fs.readFileSync(absolute, "utf8");
  }
  return { registry, sources };
}

function inspect({ registry, sources }) {
  const errors = [];
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) return ["registry contracts must be non-empty"];
  const ids = new Set();
  for (const contract of registry.contracts) {
    if (!contract.id || ids.has(contract.id)) errors.push(`missing/duplicate id: ${contract.id ?? ""}`);
    ids.add(contract.id);
    const source = sources[contract.file];
    if (!Array.isArray(contract.required_tokens) || contract.required_tokens.length === 0) errors.push(`${contract.id}: empty required_tokens`);
    for (const token of contract.required_tokens ?? []) if (!source?.includes(token)) errors.push(`${contract.id}: missing ${token}`);
    if (!Array.isArray(contract.forbidden_tokens)) errors.push(`${contract.id}: forbidden_tokens must be array`);
    for (const token of contract.forbidden_tokens ?? []) if (source?.includes(token)) errors.push(`${contract.id}: forbidden ${token}`);
  }
  return errors;
}

function selftest() {
  const good = load();
  const file = "apps/frontend/src/components/vehicle-profile/TripCostCalculator.tsx";
  if (inspect(good).length) throw new Error(`good fixture rejected: ${inspect(good).join("; ")}`);
  const mutations = [
    ["empty registry", { registry: { ...good.registry, contracts: [] }, sources: good.sources }],
    ["mutable unit", { registry: good.registry, sources: { ...good.sources, [file]: good.sources[file].replace("input.unitId", "unitId") } }],
    ["mutable company", { registry: good.registry, sources: { ...good.sources, [file]: good.sources[file].replace("input.companyId", "companyId") } }],
    ["stale success", { registry: good.registry, sources: { ...good.sources, [file]: good.sources[file].replace("if (input.generation === scopeGenerationRef.current) setResult(next);", "setResult(next);") } }],
    ["no generation advance", { registry: good.registry, sources: { ...good.sources, [file]: good.sources[file].replace("scopeGenerationRef.current += 1", "void 0") } }],
    ["result survives", { registry: good.registry, sources: { ...good.sources, [file]: good.sources[file].replaceAll("setResult(null);", "void 0;") } }],
    ["wrong dependencies", { registry: good.registry, sources: { ...good.sources, [file]: good.sources[file].replace("[companyId, unitId]", "[]") } }]
  ];
  for (const [name, fixture] of mutations) if (inspect(fixture).length === 0) throw new Error(`mutation escaped: ${name}`);
  console.log(`${LABEL}: selftest PASS (${mutations.length}/${mutations.length})`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  try {
    const errors = inspect(load());
    if (errors.length) {
      console.error(`${LABEL}: FAIL`);
      errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — Trip Cost results are bound to the submitted unit/company generation`);
  } catch (error) {
    console.error(`${LABEL}: FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
