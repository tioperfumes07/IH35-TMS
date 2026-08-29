#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "docs/specs/dispatch/DISPATCH-OVERVIEW-DERIVED-ACTION-CONTRACTS.json");
const label = "verify-dispatch-overview-derived-actions";

function readText(rel, files = null) {
  if (files && Object.hasOwn(files, rel)) return files[rel];
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) throw new Error(`missing governed file: ${rel}`);
  return fs.readFileSync(absolute, "utf8");
}

export function verify(registry, files = null) {
  const errors = [];
  if (!registry || !Array.isArray(registry.contracts) || registry.contracts.length === 0) {
    return ["registry missing non-empty contracts array"];
  }
  const ids = new Set();
  const labels = new Set();
  for (const contract of registry.contracts) {
    if (!contract?.id || !contract?.label || !contract?.component) {
      errors.push("contract missing id, label, or component");
      continue;
    }
    if (ids.has(contract.id)) errors.push(`duplicate contract id: ${contract.id}`);
    if (labels.has(contract.label)) errors.push(`duplicate KPI label: ${contract.label}`);
    ids.add(contract.id);
    labels.add(contract.label);
    try {
      const component = readText(contract.component, files);
      for (const token of contract.required_tokens ?? []) {
        if (!component.includes(token)) errors.push(`${contract.id}: component missing ${token}`);
      }
      if (contract.source) {
        const source = readText(contract.source, files);
        for (const token of contract.source_tokens ?? []) {
          if (!source.includes(token)) errors.push(`${contract.id}: source missing ${token}`);
        }
      }
    } catch (error) {
      errors.push(`${contract.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const componentPath = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
  try {
    const component = readText(componentPath, files);
    const discovered = [...component.matchAll(/<KpiCard\s+[\s\S]*?label="([^"]+)"[\s\S]*?\/>/g)].map((m) => m[1]);
    for (const found of discovered) if (!labels.has(found)) errors.push(`unregistered KPI: ${found}`);
    for (const expected of labels) if (!discovered.includes(expected)) errors.push(`registry KPI not rendered: ${expected}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
if (process.argv.includes("--selftest")) {
  const componentPath = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
  const sourcePath = "apps/backend/src/dispatch/loads.routes.ts";
  const goodFiles = {
    [componentPath]: readText(componentPath),
    [sourcePath]: readText(sourcePath),
  };
  const mutations = [
    ["missing registry entry", { ...registry, contracts: registry.contracts.slice(0, -1) }, goodFiles],
    ["missing component file", registry, { ...goodFiles, [componentPath]: undefined }],
    ["dead return drill", registry, { ...goodFiles, [componentPath]: goodFiles[componentPath].replace('to="/dispatch#units-needing-return"', "disabled") }],
    ["missing rendered panel", registry, { ...goodFiles, [componentPath]: goodFiles[componentPath].replace('data-testid="dispatch-units-needing-return-panel"', "") }],
    ["active-load contradiction restored", registry, { ...goodFiles, [sourcePath]: goodFiles[sourcePath].replaceAll("last_delivery.last_drop_at", "MAX(ls.actual_departure_at)") }],
    ["delivery type dropped", registry, { ...goodFiles, [sourcePath]: goodFiles[sourcePath].replace("delivery_stop.stop_type = 'delivery'", "delivery_stop.stop_type IS NOT NULL") }],
    ["company predicate dropped", registry, { ...goodFiles, [sourcePath]: goodFiles[sourcePath].replace("delivered_load.operating_company_id = $1::uuid", "delivered_load.operating_company_id IS NOT NULL") }],
  ];
  const failed = mutations.filter(([, mutatedRegistry, files]) => verify(mutatedRegistry, files).length === 0);
  if (failed.length) {
    console.error(`${label} selftest FAILED: ${failed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`${label} selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const errors = verify(registry);
if (errors.length) {
  console.error(`${label} FAIL:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${label} PASS — ${registry.contracts.length} derived KPI actions are registered and fail closed`);
