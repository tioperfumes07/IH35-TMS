#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "docs/specs/drivers/DRIVER-ROSTER-BULK-DEACTIVATE-CONTRACTS.json";
const LABEL = "verify-driver-roster-bulk-deactivate";

function load() {
  const registryPath = path.join(ROOT, REGISTRY);
  if (!fs.existsSync(registryPath)) throw new Error(`missing registry: ${REGISTRY}`);
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) throw new Error("registry contracts must be non-empty");
  const sources = {};
  for (const contract of registry.contracts) {
    if (!contract.file || !fs.existsSync(path.join(ROOT, contract.file))) throw new Error(`${contract.id ?? "unknown"}: missing file`);
    sources[contract.file] = fs.readFileSync(path.join(ROOT, contract.file), "utf8");
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
  if (inspect(good).length) throw new Error(`good fixture rejected: ${inspect(good).join("; ")}`);
  const ui = "apps/frontend/src/pages/drivers/DriversTable.tsx";
  const backend = "apps/backend/src/drivers/drivers-bulk.routes.ts";
  const list = "apps/frontend/src/pages/drivers/DriversListPage.tsx";
  const mutations = [
    ["empty registry", { registry: { ...good.registry, contracts: [] }, sources: good.sources }],
    ["dead action", { registry: good.registry, sources: { ...good.sources, [ui]: good.sources[ui].replace("actionLabel=\"Deactivate drivers\"", "title=\"Bulk deactivate is not available yet\"") } }],
    ["missing company", { registry: good.registry, sources: { ...good.sources, [ui]: good.sources[ui].replace("operatingCompanyId: companyId", "operatingCompanyId: undefined") } }],
    ["missing reason fk", { registry: good.registry, sources: { ...good.sources, [ui]: good.sources[ui].replace("reason_code_id: employmentReasonId", "reason_code_id: undefined") } }],
    ["backend reason gate", { registry: good.registry, sources: { ...good.sources, [backend]: good.sources[backend].replace("reason_code_id required when setting status to Inactive", "reason optional") } }],
    ["backend audit", { registry: good.registry, sources: { ...good.sources, [backend]: good.sources[backend].replaceAll("appendBulkCrudAudit", "voidAudit") } }],
    ["roster query back", { registry: good.registry, sources: { ...good.sources, [list]: good.sources[list].replaceAll("void driversQ.refetch()", "void 0") } }]
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
    console.log(`${LABEL}: PASS — registry binds roster selection to canonical audited deactivation and query-back`);
  } catch (error) {
    console.error(`${LABEL}: FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
