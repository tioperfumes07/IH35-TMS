#!/usr/bin/env node
/**
 * FLT-F6319 — A unit profile map drill must preserve the canonical unit UUID,
 * and the dispatch map must consume it against the entity-scoped live-position
 * payload's unit_uuid. A mounted route that silently ignores its unit is dead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  action: "apps/frontend/src/components/vehicle-profile/ActionBar.tsx",
  map: "apps/frontend/src/pages/dispatch/MapView.tsx",
  service: "apps/backend/src/integrations/samsara/positions/live-position.service.ts",
};

export function audit(sources) {
  const failures = [];
  if (!/href=\{`\/dispatch\/map\?unit_id=\$\{encodeURIComponent\(unitId\)\}`\}/.test(sources.action)) {
    failures.push(`${FILES.action}: View on Map must preserve encoded unit_id`);
  }
  if (!/unit_uuid:\s*string/.test(sources.map)) failures.push(`${FILES.map}: position contract must expose unit_uuid`);
  if (!/focusUnitId\s*=\s*searchParams\.get\("unit_id"\)/.test(sources.map)) {
    failures.push(`${FILES.map}: must consume canonical unit_id query`);
  }
  if (!/focusUnitId\s*&&\s*p\.unit_uuid\s*===\s*focusUnitId/.test(sources.map)) {
    failures.push(`${FILES.map}: must match unit_id against position unit_uuid`);
  }
  if (!/focusLoadId\s*\|\|\s*focusDriverId\s*\|\|\s*focusUnitId/.test(sources.map)) {
    failures.push(`${FILES.map}: unit focus must activate focused-state feedback`);
  }
  if (!/unit_uuid:\s*string/.test(sources.service) || !/unit_uuid:\s*r\.unit_uuid/.test(sources.service)) {
    failures.push(`${FILES.service}: active-load payload must retain canonical unit_uuid`);
  }
  return failures;
}

function load() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));
}

const good = load();
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["action", /\/dispatch\/map\?unit_id=/, "/dispatch/map?unit="],
    ["map", /unit_uuid:\s*string/, "unit_missing: string"],
    ["map", /searchParams\.get\("unit_id"\)/, 'searchParams.get("unit")'],
    ["map", /p\.unit_uuid\s*===\s*focusUnitId/, "false"],
    ["map", /focusLoadId\s*\|\|\s*focusDriverId\s*\|\|\s*focusUnitId/, "focusLoadId || focusDriverId"],
    ["service", /unit_uuid:\s*r\.unit_uuid/g, "unit_missing: r.unit_uuid"],
  ];
  let caught = 0;
  for (const [file, pattern, replacement] of mutations) {
    const mutated = { ...good, [file]: good[file].replace(pattern, replacement) };
    if (mutated[file] === good[file] || audit(mutated).length === 0) throw new Error(`${file} mutation escaped`);
    caught++;
  }
  if (audit(good).length) throw new Error(`real source rejected: ${audit(good).join("; ")}`);
  console.log(`verify-fleet-unit-map-focus SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(good);
if (failures.length) {
  console.error(`verify-fleet-unit-map-focus FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-fleet-unit-map-focus PASS — unit profile and dispatch map share canonical unit focus");
