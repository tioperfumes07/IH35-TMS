#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "docs/specs/drivers/DRIVER-IMPORT-RESPONSE-HONESTY-CONTRACTS.json";
const LABEL = "verify-driver-import-response-honesty";

function load() {
  const registryPath = path.join(ROOT, REGISTRY);
  if (!fs.existsSync(registryPath)) throw new Error(`missing registry: ${REGISTRY}`);
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) throw new Error("registry contracts must be non-empty");
  const sources = {};
  for (const contract of registry.contracts) {
    if (!contract.file || !fs.existsSync(path.join(ROOT, contract.file))) throw new Error(`${contract.id ?? "unknown"}: missing file ${contract.file ?? ""}`);
    sources[contract.file] = fs.readFileSync(path.join(ROOT, contract.file), "utf8");
  }
  return { registry, sources };
}

function inspect({ registry, sources }) {
  const errors = [];
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) return ["registry contracts must be non-empty"];
  const ids = new Set();
  for (const contract of registry.contracts) {
    if (!contract.id || ids.has(contract.id)) errors.push(`missing/duplicate contract id: ${contract.id ?? ""}`);
    ids.add(contract.id);
    const source = sources[contract.file];
    if (!Array.isArray(contract.required_tokens) || contract.required_tokens.length === 0) errors.push(`${contract.id}: required_tokens must be non-empty`);
    for (const token of contract.required_tokens ?? []) if (!source?.includes(token)) errors.push(`${contract.id}: missing ${token}`);
    if (!Array.isArray(contract.forbidden_tokens)) errors.push(`${contract.id}: forbidden_tokens must be an array`);
    for (const token of contract.forbidden_tokens ?? []) if (source?.includes(token)) errors.push(`${contract.id}: forbidden token present ${token}`);
  }
  return errors;
}

function selftest() {
  const good = load();
  const initial = inspect(good);
  if (initial.length) throw new Error(`good fixture rejected: ${initial.join("; ")}`);
  const api = "apps/frontend/src/api/mdata.ts";
  const ui = "apps/frontend/src/pages/drivers/DriverImportModal.tsx";
  const test = "apps/frontend/src/api/mdata.driver-import.test.ts";
  const mutations = [
    ["empty registry", { registry: { ...good.registry, contracts: [] }, sources: good.sources }],
    ["optional created count", { registry: good.registry, sources: { ...good.sources, [api]: good.sources[api].replace("created: number", "created?: number") } }],
    ["missing runtime validator", { registry: good.registry, sources: { ...good.sources, [api]: good.sources[api].replace("validateDriverImportResponse(payload, mode, operatingCompanyId)", "payload") } }],
    ["partial branch removed", { registry: good.registry, sources: { ...good.sources, [ui]: good.sources[ui].replace("if (res.row_errors > 0)", "if (false)") } }],
    ["partial refresh removed", { registry: good.registry, sources: { ...good.sources, [ui]: good.sources[ui].replace("if (res.created > 0) onImported()", "void res.created") } }],
    ["zero fallback restored", { registry: good.registry, sources: { ...good.sources, [ui]: good.sources[ui].replace("res.created} driver profiles", "res.created ?? 0} driver profiles") } }],
    ["malformed-count test removed", { registry: good.registry, sources: { ...good.sources, [test]: good.sources[test].replace("missing counts", "missing result") } }]
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
    console.log(`${LABEL}: PASS — registry binds Driver import response shape to partial-failure UI`);
  } catch (error) {
    console.error(`${LABEL}: FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
