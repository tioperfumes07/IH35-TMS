#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link","connectivity"],"leafRe":"^loads\\.create$","task":"LINK-LOADCREATE-ASSET-UNIT"} */
/**
 * LoadCreateModal's repair-block banner showed the blocking asset (always a unit — confirmed against
 * the backend's own dispatcher-facing label, load-assign.routes.ts: `Unit ${availability.asset_label}`)
 * as dead text. EntityLink kind="unit" was already a real, resolvable kind — this was a missing
 * consumer, not a missing route.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/LoadCreateModal.tsx";
const SERVICE = "apps/backend/src/dispatch/driver-availability.service.ts";
const LABEL = "verify-load-create-modal-asset-unit-link";

export function audit(source) {
  const problems = [];
  const idx = source.indexOf("Asset:");
  if (idx === -1) {
    problems.push(`${FILE}: could not locate the "Asset:" label — structure changed, re-anchor this guard`);
    return problems;
  }
  const block = source.slice(idx, idx + 400);
  if (!/<EntityLinkOrTombstone\b/.test(block)) problems.push(`${FILE}: asset must use label-aware EntityLinkOrTombstone`);
  if (!/kind="unit"/.test(block)) problems.push(`${FILE}: asset EntityLink must use kind="unit" (confirmed against backend label, not a guess)`);
  if (!/name=\{availabilityQuery\.data\?\.asset_label\}/.test(block)) problems.push(`${FILE}: asset link must be gated by its human label`);
  return problems;
}

function auditService(source) {
  const problems = [];
  if (/activeWo\.display_id\s*\|\|\s*activeWo\.id/.test(source)) problems.push(`${SERVICE}: work-order label falls back to UUID`);
  if (/activeWo\.unit_number\s*\|\|\s*activeWo\.asset_id/.test(source)) problems.push(`${SERVICE}: unit label falls back to UUID`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = 'Asset:{" "}\n<EntityLinkOrTombstone kind="unit" id={availabilityQuery.data?.asset_id} name={availabilityQuery.data?.asset_label} noun="Unit" />';
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real EntityLink block rejected`);
    process.exit(1);
  }
  const mutated = 'Asset: {availabilityQuery.data?.asset_label}';
  if (!audit(mutated).length) {
    console.error(`${LABEL} SELFTEST FAIL — reverted-to-dead-text mutation escaped`);
    process.exit(1);
  }
  const service = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const badService = service.replace('activeWo.display_id || "work order unavailable"', "activeWo.display_id || activeWo.id");
  if (badService === service || !auditService(badService).length) {
    console.error(`${LABEL} SELFTEST FAIL — UUID fallback mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — dead-text reversion rejected`);
  process.exit(0);
}

const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const failures = [...audit(source), ...auditService(fs.readFileSync(path.join(ROOT, SERVICE), "utf8"))];
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — LoadCreateModal asset label is a real, canonical EntityLink`);
