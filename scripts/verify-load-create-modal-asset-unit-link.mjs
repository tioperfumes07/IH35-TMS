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
const LABEL = "verify-load-create-modal-asset-unit-link";

export function audit(source) {
  const problems = [];
  const idx = source.indexOf("Asset:");
  if (idx === -1) {
    problems.push(`${FILE}: could not locate the "Asset:" label — structure changed, re-anchor this guard`);
    return problems;
  }
  const block = source.slice(idx, idx + 400);
  if (!/<EntityLink\b/.test(block)) problems.push(`${FILE}: asset label no longer renders <EntityLink> — reverted to dead text`);
  if (!/kind="unit"/.test(block)) problems.push(`${FILE}: asset EntityLink must use kind="unit" (confirmed against backend label, not a guess)`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = 'Asset:{" "}\n{availabilityQuery.data?.asset_id ? (\n  <EntityLink kind="unit" id={availabilityQuery.data.asset_id} label={entityLabel(availabilityQuery.data.asset_label, availabilityQuery.data.asset_id, "Asset")} />\n) : null}';
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real EntityLink block rejected`);
    process.exit(1);
  }
  const mutated = 'Asset: {entityLabel(availabilityQuery.data?.asset_label, availabilityQuery.data?.asset_id, "Asset")}';
  if (!audit(mutated).length) {
    console.error(`${LABEL} SELFTEST FAIL — reverted-to-dead-text mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — dead-text reversion rejected`);
  process.exit(0);
}

const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — LoadCreateModal asset label is a real, canonical EntityLink`);
